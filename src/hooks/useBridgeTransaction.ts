"use client";

import { useState, useCallback } from "react";
import {
  useWriteContract,
  useSwitchChain,
  useAccount,
  usePublicClient,
} from "wagmi";
import { ERC20_ABI } from "@/abi/erc20";
import { getTokenAddressEVM } from "@/config/tokens";
import { TRON_CHAIN_ID, SOLANA_CHAIN_ID } from "@/config/chains";
import { useTronLink } from "@/contexts/TronLinkContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { getAdapter } from "@/services/router";
import type { BridgeQuote, TransactionState, ExecuteContext } from "@/services/types";

interface UseBridgeTransactionResult {
  state: TransactionState;
  sourceTxHash: string | undefined;
  error: string | null;
  bridge: () => Promise<void>;
  reset: () => void;
  /** Provider-specific metadata (e.g. depositAddress for NEAR Intents) */
  executeMeta?: Record<string, string>;
}

export function useBridgeTransaction(
  quote: BridgeQuote | null,
  fromChain: number,
  toChain: number,
  fromToken: string,
  toToken: string,
  amount: bigint,
  recipient: string,
): UseBridgeTransactionResult {
  const [state, setState] = useState<TransactionState>("idle");
  const [sourceTxHash, setSourceTxHash] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [executeMeta, setExecuteMeta] = useState<Record<string, string>>();

  const { address } = useAccount();
  const { tronAddress } = useTronLink();
  const { solanaAddress, solanaWallet } = useSolanaWallet();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: fromChain });

  const bridge = useCallback(async () => {
    const sender = fromChain === SOLANA_CHAIN_ID
      ? solanaAddress
      : fromChain === TRON_CHAIN_ID
        ? tronAddress
        : address;
    if (!quote || !sender || !recipient) return;

    const adapter = getAdapter(quote.provider);
    if (!adapter) {
      setError(`Unknown provider: ${quote.provider}`);
      return;
    }

    try {
      setState("bridging");
      setError(null);

      const params = { fromChain, toChain, fromToken, toToken, amount, recipient };

      // Auto-approve if needed (skip for non-EVM chains)
      const needsApproval = adapter.needsApproval
        ? adapter.needsApproval(fromChain)
        : true;

      if (needsApproval && fromChain !== SOLANA_CHAIN_ID) {
        await switchChainAsync({ chainId: fromChain });
        const tokenAddr = getTokenAddressEVM(fromToken, fromChain);
        const spender = adapter.getApprovalAddress(fromChain);
        if (tokenAddr && spender && publicClient) {
          const approveAmount = adapter.getApproveAmount
            ? adapter.getApproveAmount(params, quote)
            : amount;
          const currentAllowance = await publicClient.readContract({
            address: tokenAddr,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [sender as `0x${string}`, spender],
          });
          if ((currentAllowance as bigint) < approveAmount) {
            await writeContractAsync({
              address: tokenAddr,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [spender, approveAmount],
              chainId: fromChain,
            });
          }
        }
      }

      // Build execution context
      const ctx: ExecuteContext = {
        writeContractAsync: writeContractAsync as unknown as ExecuteContext["writeContractAsync"],
        publicClient: publicClient as unknown as ExecuteContext["publicClient"],
        evmAddress: address,
        tronAddress: tronAddress ?? undefined,
        solanaWallet: solanaWallet as unknown as ExecuteContext["solanaWallet"],
        solanaAddress: solanaAddress ?? undefined,
      };

      // Delegate to adapter
      const result = await adapter.execute(params, quote, ctx);

      setSourceTxHash(result.hash);
      if (result.meta) setExecuteMeta(result.meta);
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
  }, [quote, address, tronAddress, solanaAddress, solanaWallet, recipient, fromChain, toChain, fromToken, toToken, amount, writeContractAsync, switchChainAsync, publicClient]);

  const reset = useCallback(() => {
    setState("idle");
    setSourceTxHash(undefined);
    setError(null);
    setExecuteMeta(undefined);
  }, []);

  return {
    state,
    sourceTxHash,
    error,
    bridge,
    reset,
    executeMeta,
  };
}
