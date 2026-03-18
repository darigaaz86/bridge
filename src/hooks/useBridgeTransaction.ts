"use client";

import { useState, useCallback } from "react";
import {
  useWriteContract,
  useSwitchChain,
  useAccount,
  usePublicClient,
} from "wagmi";
import { pad, encodeAbiParameters } from "viem";
import { ERC20_ABI } from "@/abi/erc20";
import { AGGREGATOR_ABI } from "@/abi/aggregator";
import { OFT_ABI } from "@/abi/oft";
import { getTokenAddress, getTokenAddressEVM } from "@/config/tokens";
import { TRON_CHAIN_ID } from "@/config/chains";
import { useTronLink } from "@/contexts/TronLinkContext";
import {
  CCTP_DOMAIN_IDS,
  CCTP_FORWARDING_SERVICE_HOOK_DATA,
} from "@/config/contracts";
import { USDT0_OFT_CONTRACTS, LZ_ENDPOINT_IDS } from "@/config/contracts";
import { AGGREGATOR_CONTRACTS, PROVIDER_IDS } from "@/config/contracts";
import { nearIntentsAdapter } from "@/services/nearIntents";
import type { BridgeQuote, TransactionState } from "@/services/types";

interface UseBridgeTransactionResult {
  state: TransactionState;
  sourceTxHash: string | undefined;
  error: string | null;
  approve: () => Promise<void>;
  bridge: () => Promise<void>;
  reset: () => void;
  /** Set after NEAR Intents bridge; use when adding history entry for status polling */
  nearIntentsDepositAddress?: string;
  nearIntentsDepositMemo?: string;
}

export function useBridgeTransaction(
  quote: BridgeQuote | null,
  fromChain: number,
  toChain: number,
  fromToken: string,
  toToken: string,
  amount: bigint,
  recipient: string,
  platformFeeBps?: number
): UseBridgeTransactionResult {
  const [state, setState] = useState<TransactionState>("idle");
  const [sourceTxHash, setSourceTxHash] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [nearIntentsDepositAddress, setNearIntentsDepositAddress] = useState<string | undefined>();
  const [nearIntentsDepositMemo, setNearIntentsDepositMemo] = useState<string | undefined>();

  const { address } = useAccount();
  const { tronAddress } = useTronLink();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: fromChain });

  const approve = useCallback(async () => {
    const sender = fromChain === TRON_CHAIN_ID ? tronAddress : address;
    if (!quote || !sender) return;

    try {
      setState("approving");
      setError(null);

      // Tron NEAR Intents: no EVM approval needed (Tron uses TronWeb directly)
      if (quote.provider === "near-intents" && fromChain === TRON_CHAIN_ID) {
        setState("approved");
        return;
      }

      // Switch to source chain if needed (EVM only)
      await switchChainAsync({ chainId: fromChain });

      const tokenAddress = getTokenAddressEVM(fromToken, fromChain);
      // All EVM providers now approve to the aggregator contract
      const spender = AGGREGATOR_CONTRACTS[fromChain];

      if (!tokenAddress || !spender) {
        throw new Error("Missing token or aggregator address");
      }

      // CCTP with forwarding: approve total to burn (outputAmount + bridge fee)
      const approveAmount =
        quote.provider === "cctp" ? quote.inputAmount : amount;

      // Skip approve tx if allowance is already sufficient
      if (publicClient) {
        const currentAllowance = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [sender as `0x${string}`, spender],
        });
        if (currentAllowance >= approveAmount) {
          setState("approved");
          return;
        }
      }

      await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, approveAmount],
        chainId: fromChain,
      });

      setState("approved");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Approval failed";
      if (errorMessage.includes("rejected")) {
        setState("idle");
        setError("Transaction rejected by user");
      } else {
        setState("idle");
        setError(errorMessage);
      }
    }
  }, [
    quote,
    address,
    fromChain,
    fromToken,
    amount,
    switchChainAsync,
    writeContractAsync,
    publicClient,
  ]);

  const bridge = useCallback(async () => {
    const sender = fromChain === TRON_CHAIN_ID ? tronAddress : address;
    if (!quote || !sender || !recipient) return;

    try {
      setState("bridging");
      setError(null);

      let hash: string;

      switch (quote.provider) {
        case "cctp": {
          const tokenAddress = getTokenAddressEVM("USDC", fromChain);
          const aggregator = AGGREGATOR_CONTRACTS[fromChain];
          const destDomain = CCTP_DOMAIN_IDS[toChain];

          if (!tokenAddress || !aggregator || destDomain === undefined) {
            throw new Error("CCTP not supported for this route");
          }

          const recipientBytes32 = pad(recipient as `0x${string}`, { size: 32 });
          const totalToBurn = quote.inputAmount;
          const maxFee = quote.bridgeFee;
          const minFinalityThreshold = quote.cctpFast ? 1000 : 2000;

          // Encode CCTP provider data: (uint32 destDomain, bytes32 mintRecipient, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)
          const providerData = encodeAbiParameters(
            [
              { type: "uint32" },
              { type: "bytes32" },
              { type: "uint256" },
              { type: "uint32" },
              { type: "bytes" },
            ],
            [destDomain, recipientBytes32, maxFee, minFinalityThreshold, CCTP_FORWARDING_SERVICE_HOOK_DATA]
          );

          hash = await writeContractAsync({
            address: aggregator,
            abi: AGGREGATOR_ABI,
            functionName: "bridge",
            args: [
              PROVIDER_IDS.cctp,
              tokenAddress,
              totalToBurn,
              BigInt(toChain),
              recipientBytes32,
              providerData,
            ],
            chainId: fromChain,
          });
          break;
        }

        case "usdt0": {
          const oftContract = USDT0_OFT_CONTRACTS[fromChain];
          const aggregator = AGGREGATOR_CONTRACTS[fromChain];
          const dstEid = LZ_ENDPOINT_IDS[toChain];

          if (!oftContract || !aggregator || !dstEid) {
            throw new Error("USDT0 OFT not supported for this route");
          }

          const recipientBytes32 = pad(recipient as `0x${string}`, { size: 32 });
          const minAmountLD = (amount * 995n) / 1000n; // 0.5% slippage
          const extraOptions = "0x" as `0x${string}`;
          const composeMsg = "0x" as `0x${string}`;
          const oftCmd = "0x" as `0x${string}`;

          // Quote the LayerZero fee from the OFT contract (still needed for msg.value)
          const sendParam = {
            dstEid,
            to: recipientBytes32,
            amountLD: amount,
            minAmountLD,
            extraOptions,
            composeMsg,
            oftCmd,
          };

          let nativeFee: bigint;
          if (publicClient) {
            try {
              const msgFee = await publicClient.readContract({
                address: oftContract,
                abi: OFT_ABI,
                functionName: "quoteSend",
                args: [sendParam, false],
              }) as { nativeFee: bigint; lzTokenFee: bigint };
              nativeFee = msgFee.nativeFee;
            } catch {
              throw new Error(
                "Could not get USDT0 bridge fee. Ensure you have enough native token (ETH) for gas and the LayerZero fee."
              );
            }
          } else {
            nativeFee = 100000000000000n;
          }

          // Encode USDT0 provider data: (uint32 dstEid, bytes32 recipient, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd)
          const providerData = encodeAbiParameters(
            [
              { type: "uint32" },
              { type: "bytes32" },
              { type: "uint256" },
              { type: "bytes" },
              { type: "bytes" },
              { type: "bytes" },
            ],
            [dstEid, recipientBytes32, minAmountLD, extraOptions, composeMsg, oftCmd]
          );

          hash = await writeContractAsync({
            address: aggregator,
            abi: AGGREGATOR_ABI,
            functionName: "bridge",
            args: [
              PROVIDER_IDS.usdt0,
              oftContract,
              amount,
              BigInt(toChain),
              recipientBytes32,
              providerData,
            ],
            value: nativeFee,
            chainId: fromChain,
          });
          break;
        }

        case "near-intents": {
          if (fromChain === TRON_CHAIN_ID) {
            // Tron: use TronWeb to send TRC20 transfer to deposit address (no aggregator on Tron)
            if (!window.tronWeb?.contract) {
              throw new Error("TronLink not ready. Please refresh and connect TronLink.");
            }
            const execQuote = await nearIntentsAdapter.getExecutionQuote({
              fromChain,
              toChain,
              fromToken,
              toToken,
              amount,
              recipient,
              refundTo: tronAddress ?? undefined,
              platformFeeBps,
            });
            console.log("[NEAR Intents] Tron execQuote", {
              depositAddress: execQuote.depositAddress,
              depositMemo: execQuote.depositMemo,
              amountIn: execQuote.amountIn.toString(),
            });
            setNearIntentsDepositAddress(execQuote.depositAddress);
            setNearIntentsDepositMemo(execQuote.depositMemo ?? undefined);
            const trc20Address = getTokenAddress(fromToken, fromChain);
            if (!trc20Address) throw new Error("Unsupported token for Tron");
            const tw = window.tronWeb!;
            const amountStr = execQuote.amountIn.toString();
            const toAddr = execQuote.depositAddress;

            let txResult: { transaction?: string; txid?: string } | string | null = null;
            try {
              const factory = await Promise.resolve(tw.contract(
                [
                  {
                    name: "transfer",
                    type: "function",
                    inputs: [
                      { name: "to", type: "address" },
                      { name: "value", type: "uint256" },
                    ],
                    outputs: [{ name: "", type: "bool" }],
                    stateMutability: "nonpayable",
                  },
                ],
                trc20Address
              ));
              const instance = typeof (factory as { at?: (a: string) => unknown }).at === "function"
                ? (factory as { at: (a: string) => unknown }).at(trc20Address)
                : factory;
              const inst = instance as {
                transfer?: (to: string, amount: string) => { send: (o?: { from: string }) => Promise<unknown> };
                methods?: { transfer?: (to: string, amount: string) => { send: (o?: { from: string }) => Promise<unknown> } };
              };
              let sendable: { send?: (o?: { from: string }) => Promise<unknown> } | null = null;
              if (inst.transfer) {
                sendable = inst.transfer(toAddr, amountStr) as { send?: (o?: { from: string }) => Promise<unknown> };
              } else if (inst.methods?.transfer) {
                sendable = inst.methods.transfer(toAddr, amountStr) as { send?: (o?: { from: string }) => Promise<unknown> };
              }
              if (sendable && typeof sendable.send === "function") {
                const tx = await sendable.send({ from: tronAddress! });
                txResult = tx as { transaction?: string; txid?: string };
              }
            } catch {
              // Fallback: triggerSmartContract + sign + sendRawTransaction
            }
            if (!txResult && tw.transactionBuilder?.triggerSmartContract && tw.trx?.sign && tw.trx?.sendRawTransaction) {
              const functionSelector = "transfer(address,uint256)";
              const parameter = [
                { type: "address", value: toAddr },
                { type: "uint256", value: amountStr },
              ];
              const built = await tw.transactionBuilder.triggerSmartContract(
                trc20Address,
                functionSelector,
                {},
                parameter
              );
              if (built?.transaction) {
                const signed = await tw.trx.sign(built.transaction);
                const result = (await tw.trx.sendRawTransaction(signed)) as { txid?: string; transaction?: string | { txID?: string } };
                const txId = result?.txid ?? (typeof result?.transaction === "string" ? result.transaction : result?.transaction?.txID);
                if (txId) txResult = { txid: txId };
              }
            }
            hash = typeof txResult === "string" ? txResult : (txResult?.txid ?? (txResult as { transaction?: string })?.transaction ?? "");
            if (!hash) throw new Error("Tron transaction failed");
            try {
              await nearIntentsAdapter.submitDepositTx(
                hash,
                execQuote.depositAddress,
                execQuote.depositMemo
              );
            } catch {
              // Non-fatal
            }
          } else {
            // EVM NEAR Intents: get deposit address, then route through aggregator
            await switchChainAsync({ chainId: fromChain });
            const aggregator = AGGREGATOR_CONTRACTS[fromChain];
            if (!aggregator) {
              throw new Error("Aggregator not configured for this chain");
            }

            const execQuote = await nearIntentsAdapter.getExecutionQuote({
              fromChain,
              toChain,
              fromToken,
              toToken,
              amount,
              recipient,
              refundTo: address ?? undefined,
              platformFeeBps,
            });
            console.log("[NEAR Intents] EVM execQuote", {
              depositAddress: execQuote.depositAddress,
              depositMemo: execQuote.depositMemo,
              amountIn: execQuote.amountIn.toString(),
            });
            setNearIntentsDepositAddress(execQuote.depositAddress);
            setNearIntentsDepositMemo(execQuote.depositMemo ?? undefined);

            const tokenAddress = getTokenAddressEVM(fromToken, fromChain);
            if (!tokenAddress) throw new Error("Unsupported token for this chain");

            const recipientBytes32 = pad(recipient as `0x${string}`, { size: 32 });

            // Encode NEAR Intents provider data: (address depositAddress)
            const providerData = encodeAbiParameters(
              [{ type: "address" }],
              [execQuote.depositAddress as `0x${string}`]
            );

            hash = await writeContractAsync({
              address: aggregator,
              abi: AGGREGATOR_ABI,
              functionName: "bridge",
              args: [
                PROVIDER_IDS["near-intents"],
                tokenAddress,
                execQuote.amountIn,
                BigInt(toChain),
                recipientBytes32,
                providerData,
              ],
              chainId: fromChain,
            });

            try {
              await nearIntentsAdapter.submitDepositTx(
                hash,
                execQuote.depositAddress,
                execQuote.depositMemo
              );
            } catch {
              // Non-fatal: status can still be polled by deposit address
            }
          }
          break;
        }

        default:
          throw new Error(`Unsupported provider: ${quote.provider}`);
      }

      setSourceTxHash(hash);
      setState("pending");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Bridge transaction failed";
      if (errorMessage.includes("rejected")) {
        setState("approved");
        setError("Transaction rejected by user");
      } else {
        setState("idle");
        setError(errorMessage);
      }
    }
  }, [quote, address, tronAddress, recipient, fromChain, toChain, fromToken, toToken, amount, writeContractAsync, switchChainAsync, publicClient]);

  const reset = useCallback(() => {
    setState("idle");
    setSourceTxHash(undefined);
    setError(null);
    setNearIntentsDepositAddress(undefined);
    setNearIntentsDepositMemo(undefined);
  }, []);

  return {
    state,
    sourceTxHash,
    error,
    approve,
    bridge,
    reset,
    nearIntentsDepositAddress,
    nearIntentsDepositMemo,
  };
}
