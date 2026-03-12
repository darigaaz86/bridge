"use client";

import { useState, useEffect, useCallback } from "react";
import { getAdapter } from "@/services/router";
import type { TransactionStatus, BridgeProvider } from "@/services/types";
import { STATUS_POLL_INTERVAL } from "@/config/constants";

export function useTransactionStatus(
  txHash: string | undefined,
  provider: BridgeProvider | undefined,
  fromChain: number | undefined,
  toChain: number | undefined,
  options?: { depositAddress?: string; depositMemo?: string }
) {
  const [status, setStatus] = useState<TransactionStatus>({ state: "idle" });

  const checkStatus = useCallback(async () => {
    if (!txHash || !provider || !fromChain || !toChain) return;

    const adapter = getAdapter(provider);
    if (!adapter) return;

    try {
      const newStatus = await adapter.getStatus(txHash, fromChain, toChain, options);
      setStatus(newStatus);
    } catch (error) {
      console.error("Status check failed:", error);
    }
  }, [txHash, provider, fromChain, toChain, options?.depositAddress, options?.depositMemo]);

  useEffect(() => {
    if (!txHash || !provider) {
      setStatus({ state: "idle" });
      return;
    }

    // Initial check
    checkStatus();

    // Poll for updates (interval from settings)
    const interval = setInterval(checkStatus, STATUS_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [txHash, provider, checkStatus]);

  // Stop polling when done or failed
  useEffect(() => {
    if (status.state === "done" || status.state === "failed") {
      // No need to keep polling
    }
  }, [status.state]);

  return status;
}
