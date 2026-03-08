"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getQuotes } from "@/services/router";
import type { BridgeQuote, BridgeParams } from "@/services/types";
import { QUOTE_DEBOUNCE_MS } from "@/config/constants";
import { useBridgeSettings } from "@/contexts/BridgeSettingsContext";

interface UseBridgeQuoteResult {
  quotes: BridgeQuote[];
  bestQuote: BridgeQuote | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBridgeQuote(
  params: Omit<BridgeParams, "recipient"> | null
): UseBridgeQuoteResult {
  const { settings } = useBridgeSettings();
  const [quotes, setQuotes] = useState<BridgeQuote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval>>(null);
  const fetchCount = useRef(0);

  const fetchQuotes = useCallback(async () => {
    if (!params || params.amount <= 0n) {
      setQuotes([]);
      setError(null);
      return;
    }

    const currentFetch = ++fetchCount.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await getQuotes({
        ...params,
        recipient: "0x0000000000000000000000000000000000000000", // placeholder for quote
      });

      // Only update if this is still the latest fetch
      if (currentFetch === fetchCount.current) {
        setQuotes(result);
        if (result.length === 0) {
          setError("No routes available for this transfer");
        }
      }
    } catch (err) {
      if (currentFetch === fetchCount.current) {
        setError("Failed to fetch quotes");
        console.error("Quote fetch error:", err);
      }
    } finally {
      if (currentFetch === fetchCount.current) {
        setIsLoading(false);
      }
    }
  }, [params]);

  // Debounced fetch on param changes
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchQuotes();
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [fetchQuotes]);

  // Auto-refresh interval (from settings)
  useEffect(() => {
    if (!params || params.amount <= 0n) return;

    refreshTimer.current = setInterval(() => {
      fetchQuotes();
    }, settings.quoteRefreshIntervalMs);

    return () => {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
      }
    };
  }, [fetchQuotes, params, settings.quoteRefreshIntervalMs]);

  return {
    quotes,
    bestQuote: quotes[0] || null,
    isLoading,
    error,
    refetch: fetchQuotes,
  };
}
