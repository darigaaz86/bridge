"use client";

import { useState, useCallback } from "react";
import {
  useWriteContract,
  useSwitchChain,
  useAccount,
  usePublicClient,
} from "wagmi";
import { pad } from "viem";
import { ERC20_ABI } from "@/abi/erc20";
import { TOKEN_MESSENGER_V2_ABI } from "@/abi/tokenMessengerV2";
import { OFT_ABI } from "@/abi/oft";
import { getTokenAddress } from "@/config/tokens";
import {
  CCTP_TOKEN_MESSENGER_V2,
  CCTP_DOMAIN_IDS,
  CCTP_FORWARDING_SERVICE_HOOK_DATA,
} from "@/config/contracts";
import { USDT0_OFT_CONTRACTS, LZ_ENDPOINT_IDS } from "@/config/contracts";
import { getAdapter } from "@/services/router";
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
  amount: bigint
): UseBridgeTransactionResult {
  const [state, setState] = useState<TransactionState>("idle");
  const [sourceTxHash, setSourceTxHash] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [nearIntentsDepositAddress, setNearIntentsDepositAddress] = useState<string | undefined>();
  const [nearIntentsDepositMemo, setNearIntentsDepositMemo] = useState<string | undefined>();

  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: fromChain });

  const approve = useCallback(async () => {
    if (!quote || !address) return;

    try {
      setState("approving");
      setError(null);

      // NEAR Intents: no approval step; user sends tokens to deposit address via transfer()
      if (quote.provider === "near-intents") {
        setState("approved");
        return;
      }

      // Switch to source chain if needed
      await switchChainAsync({ chainId: fromChain });

      const tokenAddress = getTokenAddress(fromToken, fromChain);
      const adapter = getAdapter(quote.provider);
      const spender = adapter?.getApprovalAddress(fromChain);

      if (!tokenAddress || !spender) {
        throw new Error("Missing token or spender address");
      }

      // CCTP with forwarding: approve total to burn (outputAmount + bridge fee)
      const approveAmount =
        quote.provider === "cctp" ? quote.inputAmount : amount;

      // Skip approve tx if allowance is already sufficient (e.g. previous approval or reset to 0 not done)
      if (publicClient) {
        const currentAllowance = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, spender],
        });
        if (currentAllowance >= approveAmount) {
          setState("approved");
          return;
        }
      }

      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, approveAmount],
        chainId: fromChain,
      });

      // Wait for approval tx to confirm
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
    if (!quote || !address) return;

    try {
      setState("bridging");
      setError(null);

      let hash: string;

      switch (quote.provider) {
        case "cctp": {
          const tokenAddress = getTokenAddress("USDC", fromChain);
          const messenger = CCTP_TOKEN_MESSENGER_V2[fromChain];
          const destDomain = CCTP_DOMAIN_IDS[toChain];

          if (!tokenAddress || !messenger || destDomain === undefined) {
            throw new Error("CCTP not supported for this route");
          }

          const recipientBytes32 = pad(address, { size: 32 });
          const destinationCaller =
            "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
          const totalToBurn = quote.inputAmount;
          const maxFee = quote.bridgeFee;
          // Fast Transfer: 1000 (~20–60s, protocol fee). Standard: 2000 (~15m+, no protocol fee)
          const minFinalityThreshold = quote.cctpFast ? 1000 : 2000;

          hash = await writeContractAsync({
            address: messenger,
            abi: TOKEN_MESSENGER_V2_ABI,
            functionName: "depositForBurnWithHook",
            args: [
              totalToBurn,
              destDomain,
              recipientBytes32,
              tokenAddress,
              destinationCaller,
              maxFee,
              minFinalityThreshold,
              CCTP_FORWARDING_SERVICE_HOOK_DATA,
            ],
            chainId: fromChain,
          });
          break;
        }

        case "usdt0": {
          const oftContract = USDT0_OFT_CONTRACTS[fromChain];
          const dstEid = LZ_ENDPOINT_IDS[toChain];

          if (!oftContract || !dstEid) {
            throw new Error("USDT0 OFT not supported for this route");
          }

          const recipientBytes32 = pad(address, { size: 32 });

          const sendParam = {
            dstEid,
            to: recipientBytes32,
            amountLD: amount,
            minAmountLD: (amount * 995n) / 1000n, // 0.5% slippage
            extraOptions: "0x" as `0x${string}`,
            composeMsg: "0x" as `0x${string}`,
            oftCmd: "0x" as `0x${string}`,
          };

          // Get exact LayerZero fee from contract so send() doesn't revert (insufficient fee)
          let nativeFee: bigint;
          let lzTokenFee: bigint;
          if (publicClient) {
            try {
              const msgFee = await publicClient.readContract({
                address: oftContract,
                abi: OFT_ABI,
                functionName: "quoteSend",
                args: [sendParam, false],
              }) as { nativeFee: bigint; lzTokenFee: bigint };
              nativeFee = msgFee.nativeFee;
              lzTokenFee = msgFee.lzTokenFee ?? 0n;
            } catch (e) {
              throw new Error(
                "Could not get USDT0 bridge fee. Ensure you have enough native token (ETH) for gas and the LayerZero fee."
              );
            }
          } else {
            nativeFee = 100000000000000n;
            lzTokenFee = 0n;
          }

          hash = await writeContractAsync({
            address: oftContract,
            abi: OFT_ABI,
            functionName: "send",
            args: [
              sendParam,
              { nativeFee, lzTokenFee },
              address,
            ],
            value: nativeFee,
            chainId: fromChain,
          });
          break;
        }

        case "near-intents": {
          await switchChainAsync({ chainId: fromChain });
          const execQuote = await nearIntentsAdapter.getExecutionQuote({
            fromChain,
            toChain,
            fromToken,
            toToken,
            amount,
            recipient: address as `0x${string}`,
          });
          setNearIntentsDepositAddress(execQuote.depositAddress);
          setNearIntentsDepositMemo(execQuote.depositMemo ?? undefined);
          const tokenAddress = getTokenAddress(fromToken, fromChain);
          if (!tokenAddress) throw new Error("Unsupported token for this chain");
          hash = await writeContractAsync({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [execQuote.depositAddress as `0x${string}`, execQuote.amountIn],
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
  }, [quote, address, fromChain, toChain, fromToken, toToken, amount, writeContractAsync, switchChainAsync, publicClient]);

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
