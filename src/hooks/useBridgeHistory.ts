"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import type { BridgeHistoryEntry } from "@/lib/bridgeHistory";
import {
  getHistory,
  saveHistory,
  addHistoryEntry as addEntryStorage,
  updateHistoryEntry as updateEntryStorage,
} from "@/lib/bridgeHistory";

export function useBridgeHistory() {
  const { address } = useAccount();
  const [history, setHistory] = useState<BridgeHistoryEntry[]>([]);

  useEffect(() => {
    if (!address) {
      setHistory([]);
      return;
    }
    setHistory(getHistory(address));
  }, [address]);

  const addEntry = useCallback(
    (entry: Omit<BridgeHistoryEntry, "id" | "createdAt" | "status">) => {
      if (!address) return null;
      const added = addEntryStorage(address, entry);
      setHistory((prev) => [added, ...prev]);
      return added;
    },
    [address]
  );

  const updateEntry = useCallback(
    (
      id: string,
      updates: Partial<
        Pick<BridgeHistoryEntry, "status" | "destinationTxHash" | "failureMessage">
      >
    ) => {
      if (!address) return;
      updateEntryStorage(address, id, updates);
      setHistory((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
      );
    },
    [address]
  );

  const refreshFromStorage = useCallback(() => {
    if (!address) return;
    setHistory(getHistory(address));
  }, [address]);

  return { history, addEntry, updateEntry, refreshFromStorage };
}
