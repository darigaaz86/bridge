"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import type { BridgeHistoryEntry } from "@/lib/bridgeHistory";

export function useBridgeHistory() {
  const { address } = useAccount();
  const [history, setHistory] = useState<BridgeHistoryEntry[]>([]);

  const fetchHistory = useCallback(async () => {
    if (!address) {
      setHistory([]);
      return;
    }
    try {
      const res = await fetch(`/api/history?address=${address}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // silent
    }
  }, [address]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const addEntry = useCallback(
    async (entry: Omit<BridgeHistoryEntry, "id" | "createdAt" | "status">) => {
      if (!address) return null;
      try {
        const res = await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...entry, walletAddress: address }),
        });
        if (res.ok) {
          const added: BridgeHistoryEntry = await res.json();
          setHistory((prev) => [added, ...prev]);
          return added;
        }
      } catch {
        // silent
      }
      return null;
    },
    [address]
  );

  const updateEntry = useCallback(
    async (
      id: string,
      updates: Partial<
        Pick<BridgeHistoryEntry, "status" | "destinationTxHash" | "failureMessage">
      >
    ) => {
      if (!address) return;
      try {
        await fetch(`/api/history/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        setHistory((prev) =>
          prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
        );
      } catch {
        // silent
      }
    },
    [address]
  );

  return { history, addEntry, updateEntry, refreshFromStorage: fetchHistory };
}
