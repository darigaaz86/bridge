"use client";

import { useState, useEffect, useRef } from "react";
import {
  TokenInfo,
  getTokensForChain,
  getTokensForChainAsync,
} from "@/config/tokens";

interface UseTokensResult {
  tokens: TokenInfo[];
  isLoading: boolean;
}

export function useTokens(chainId: number): UseTokensResult {
  const [tokens, setTokens] = useState<TokenInfo[]>(() =>
    getTokensForChain(chainId)
  );
  const [isLoading, setIsLoading] = useState(true);
  const fetchCount = useRef(0);

  useEffect(() => {
    const currentFetch = ++fetchCount.current;

    setIsLoading(true);
    setTokens(getTokensForChain(chainId));

    getTokensForChainAsync(chainId)
      .then((result) => {
        if (currentFetch === fetchCount.current) {
          setTokens(result);
        }
      })
      .catch(() => {
        // Keep hardcoded tokens on failure — no error shown to user (Req 11.3)
      })
      .finally(() => {
        if (currentFetch === fetchCount.current) {
          setIsLoading(false);
        }
      });
  }, [chainId]);

  return { tokens, isLoading };
}
