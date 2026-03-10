"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getQuotes } from "@/services/router";
import type { BridgeQuote, BridgeParams } from "@/services/types";
import { QUOTE_DEBOUNCE_MS } from "@/config/constants";
import { TRON_CHAIN_ID } from "@/config/chains";

/** Placeholder recipient for quote-only requests. 1Click expects format matching destination chain. */
const TRON_PLACEHOLDER_RECIPIENT = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const EVM_PLACEHOLDER_RECIPIENT = "0x0000000000000000000000000000000000000000";

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
  const [quotes, setQuotes] = useState<BridgeQuote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);
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
      const recipient =
        params.toChain === TRON_CHAIN_ID
          ? TRON_PLACEHOLDER_RECIPIENT
          : EVM_PLACEHOLDER_RECIPIENT;
      const result = await getQuotes({
        ...params,
        recipient,
      });

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

  return {
    quotes,
    bestQuote: quotes[0] || null,
    isLoading,
    error,
    refetch: fetchQuotes,
  };
}
