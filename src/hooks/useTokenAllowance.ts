"use client";

import { useReadContract, useAccount } from "wagmi";
import { ERC20_ABI } from "@/abi/erc20";

export function useTokenAllowance(
  tokenAddress: `0x${string}` | undefined,
  spenderAddress: `0x${string}` | undefined,
  chainId: number | undefined
) {
  const { address } = useAccount();

  const { data: allowance, isSuccess: allowanceFetched, refetch: refetchAllowance, ...rest } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && spenderAddress ? [address, spenderAddress] : undefined,
    chainId,
    query: {
      enabled: !!tokenAddress && !!spenderAddress && !!address && !!chainId,
      refetchInterval: 10_000,
    },
  });

  return {
    allowance: (allowance as bigint) ?? 0n,
    allowanceFetched: !!allowanceFetched,
    refetchAllowance,
    ...rest,
  };
}
