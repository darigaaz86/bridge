"use client";

import { useState, useEffect, useCallback } from "react";
import { getAdapter } from "@/services/router";
import type { TransactionStatus, BridgeProvider } from "@/services/types";
import { useBridgeSettings } from "@/contexts/BridgeSettingsContext";

export function useTransactionStatus(
  txHash: string | undefined,
  provider: BridgeProvider | undefined,
  fromChain: number | undefined,
  toChain: number | undefined
) {
  const { settings } = useBridgeSettings();
  const [status, setStatus] = useState<TransactionStatus>({ state: "idle" });

  const checkStatus = useCallback(async () => {
    if (!txHash || !provider || !fromChain || !toChain) return;

    const adapter = getAdapter(provider);
    if (!adapter) return;

    try {
      const newStatus = await adapter.getStatus(txHash, fromChain, toChain);
      setStatus(newStatus);
    } catch (error) {
      console.error("Status check failed:", error);
    }
  }, [txHash, provider, fromChain, toChain]);

  useEffect(() => {
    if (!txHash || !provider) {
      setStatus({ state: "idle" });
      return;
    }

    // Initial check
    checkStatus();

    // Poll for updates (interval from settings)
    const interval = setInterval(checkStatus, settings.statusPollIntervalMs);

    return () => clearInterval(interval);
  }, [txHash, provider, checkStatus, settings.statusPollIntervalMs]);

  // Stop polling when done or failed
  useEffect(() => {
    if (status.state === "done" || status.state === "failed") {
      // No need to keep polling
    }
  }, [status.state]);

  return status;
}
