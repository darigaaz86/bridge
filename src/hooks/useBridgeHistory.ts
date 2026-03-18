"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { INDEXER_API_URL } from "@/config/contracts";
import type { BridgeHistoryEntry } from "@/lib/bridgeHistory";

const CACHE_KEY_PREFIX = "qorebridge_history_";

function cacheKey(address: string): string {
  return `${CACHE_KEY_PREFIX}${address.toLowerCase()}`;
}

function loadFromCache(address: string): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(cacheKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BridgeHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToCache(address: string, entries: BridgeHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(address), JSON.stringify(entries));
  } catch {
    // silent — localStorage may be full or unavailable
  }
}

export function useBridgeHistory() {
  const { address } = useAccount();
  const [history, setHistory] = useState<BridgeHistoryEntry[]>([]);

  const fetchHistory = useCallback(async () => {
    if (!address) {
      setHistory([]);
      return;
    }
    try {
      const res = await fetch(
        `${INDEXER_API_URL}/api/history?address=${address}`
      );
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
        saveToCache(address, data);
        return;
      }
    } catch {
      // indexer unavailable — fall through to cache
    }
    // Fallback: load from localStorage cache
    const cached = loadFromCache(address);
    if (cached.length > 0) {
      setHistory(cached);
    }
  }, [address]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, refreshFromStorage: fetchHistory };
}
