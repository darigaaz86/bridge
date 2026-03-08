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
import type { BridgeQuote, TransactionState } from "@/services/types";

interface UseBridgeTransactionResult {
  state: TransactionState;
  sourceTxHash: string | undefined;
  error: string | null;
  approve: () => Promise<void>;
  bridge: () => Promise<void>;
  reset: () => void;
}

export function useBridgeTransaction(
  quote: BridgeQuote | null,
  fromChain: number,
  toChain: number,
  fromToken: string,
  amount: bigint
): UseBridgeTransactionResult {
  const [state, setState] = useState<TransactionState>("idle");
  const [sourceTxHash, setSourceTxHash] = useState<string>();
  const [error, setError] = useState<string | null>(null);

  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: fromChain });

  const approve = useCallback(async () => {
    if (!quote || !address) return;

    try {
      setState("approving");
      setError(null);

      // NEAR Intents uses a different flow (SDK / intents), not ERC-20 approve
      if (quote.provider === "near-intents") {
        throw new Error(
          "NEAR Intents execution is not available in this app yet. Please select Circle CCTP or USDT0 to bridge."
        );
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

          // First get the quote for LZ fees
          // In production, call quoteSend() first to get exact nativeFee
          // For now, send with estimated gas
          const estimatedLzFee = 100000000000000n; // ~0.0001 ETH fallback

          hash = await writeContractAsync({
            address: oftContract,
            abi: OFT_ABI,
            functionName: "send",
            args: [
              sendParam,
              { nativeFee: estimatedLzFee, lzTokenFee: 0n },
              address,
            ],
            value: estimatedLzFee,
            chainId: fromChain,
          });
          break;
        }

        case "near-intents": {
          // NEAR Intents would use the SDK for intent creation
          // For now, throw a descriptive error
          throw new Error(
            "NEAR Intents execution requires the @defuse-protocol/intents-sdk. Coming soon."
          );
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
  }, [quote, address, fromChain, toChain, amount, writeContractAsync]);

  const reset = useCallback(() => {
    setState("idle");
    setSourceTxHash(undefined);
    setError(null);
  }, []);

  return {
    state,
    sourceTxHash,
    error,
    approve,
    bridge,
    reset,
  };
}
