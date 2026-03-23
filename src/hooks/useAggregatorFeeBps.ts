"use client";

import { useReadContract } from "wagmi";
import { AGGREGATOR_CONTRACTS } from "@/config/contracts";
import { AGGREGATOR_ABI } from "@/abi/aggregator";

const FALLBACK_FEE_BPS = 5;

/**
 * Reads the current feeBps from the on-chain aggregator contract.
 * Falls back to FALLBACK_FEE_BPS if the read fails or no aggregator is deployed on the chain.
 */
export function useAggregatorFeeBps(chainId: number): number {
  const aggregator = AGGREGATOR_CONTRACTS[chainId];

  const { data } = useReadContract({
    address: aggregator,
    abi: AGGREGATOR_ABI,
    functionName: "feeBps",
    chainId,
    query: {
      enabled: !!aggregator,
      staleTime: 60_000, // cache for 1 min
    },
  });

  if (data != null) return Number(data);
  return FALLBACK_FEE_BPS;
}
