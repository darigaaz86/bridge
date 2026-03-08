"use client";

import { useReadContract, useAccount } from "wagmi";
import { ERC20_ABI } from "@/abi/erc20";

export function useTokenBalance(
  tokenAddress: `0x${string}` | undefined,
  chainId: number | undefined
) {
  const { address } = useAccount();

  const { data: balance, ...rest } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !!tokenAddress && !!address && !!chainId,
      refetchInterval: 15_000,
    },
  });

  return {
    balance: (balance as bigint) ?? 0n,
    ...rest,
  };
}
