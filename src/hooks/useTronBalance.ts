"use client";

import { useState, useEffect, useCallback } from "react";
import { toHex as tronAddressToHex } from "tronweb/utils";
import { isTronChain } from "@/config/tokens";

const TRONGRID_API = "https://api.trongrid.io";

const TRC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
];

function parseBalanceResult(res: unknown): string {
  if (res == null) return "0";
  const r = res as { toString?: () => string; _hex?: string; call?: () => Promise<unknown> };
  if (typeof r.toString === "function") return r.toString();
  if (r._hex != null) return String(r._hex);
  return "0";
}

/** ABI-encode address for balanceOf(address): 32-byte hex, left-padded */
function encodeAddressForParam(hexAddr: string): string {
  const hex = hexAddr.startsWith("0x") ? hexAddr.slice(2) : hexAddr;
  return hex.padStart(64, "0");
}

export function useTronBalance(
  tokenAddress: string | undefined,
  chainId: number | undefined,
  ownerAddress: string | null
) {
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !tokenAddress ||
      !ownerAddress ||
      !chainId ||
      !isTronChain(chainId)
    ) {
      setBalance(0n);
      return;
    }
    setLoading(true);
    try {
      const tw = typeof window !== "undefined" ? window.tronWeb : undefined;
      // Always get hex for contract calls: use tronweb package (reliable) or injected TronWeb
      const ownerHex =
        ownerAddress.startsWith("T")
          ? (() => {
              try {
                return tronAddressToHex(ownerAddress);
              } catch {
                return tw?.address?.toHex?.(ownerAddress) ?? null;
              }
            })()
          : ownerAddress;
      let raw = "0";

      // 1) TronWeb contract API (if available)
      if (tw?.contract && ownerHex) {
        try {
          const factory = await Promise.resolve(
            tw.contract(TRC20_ABI, tokenAddress) as Promise<{ at?: (a: string) => unknown; balanceOf?: (addr: string) => { call: () => Promise<unknown> } }> | { at?: (a: string) => unknown; balanceOf?: (addr: string) => { call: () => Promise<unknown> } }
          );
          const instance = typeof factory.at === "function" ? factory.at(tokenAddress) : factory;
          const inst = instance as {
            balanceOf?: (addr: string) => { call: () => Promise<unknown> };
            methods?: { balanceOf?: (addr: string) => { call: () => Promise<unknown> } };
          };
          const balanceFn = inst.balanceOf ?? inst.methods?.balanceOf;
          if (balanceFn) {
            const callResult = balanceFn(ownerHex);
            const res = typeof (callResult as { call?: () => Promise<unknown> }).call === "function"
              ? await (callResult as { call: () => Promise<unknown> }).call()
              : callResult;
            raw = parseBalanceResult(res);
          }
        } catch {
          // Fall through to next method
        }
      }

      // 2) TronWeb triggerConstantContract (if available and balance still 0)
      if (raw === "0" && tw?.transactionBuilder?.triggerConstantContract && ownerHex) {
        try {
          const result = await tw.transactionBuilder.triggerConstantContract(
            tokenAddress,
            "balanceOf(address)",
            {},
            [{ type: "address", value: ownerHex }]
          );
          const hex = result?.constant_result?.[0];
          if (hex != null && hex !== "") {
            raw = String(BigInt(hex.startsWith("0x") ? hex : `0x${hex}`));
          }
        } catch {
          // Fall through
        }
      }

      // 3) Direct TronGrid API (bypasses TronWeb/TronLink entirely – most reliable)
      if (raw === "0") {
        try {
          const hexForParam = ownerHex ?? (ownerAddress.startsWith("T") ? (() => { try { return tronAddressToHex(ownerAddress); } catch { return null; } })() : ownerAddress);
          const paramHex = hexForParam ? encodeAddressForParam(hexForParam) : null;
          if (paramHex) {
            const body = {
              owner_address: ownerAddress,
              contract_address: tokenAddress,
              function_selector: "balanceOf(address)",
              parameter: paramHex,
              visible: true,
            };
            const res = await fetch(`${TRONGRID_API}/wallet/triggerconstantcontract`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = (await res.json()) as { constant_result?: string[] };
            const hex = data?.constant_result?.[0];
            if (hex != null && hex !== "") {
              raw = String(BigInt(hex.startsWith("0x") ? hex : `0x${hex}`));
            }
          }
        } catch {
          // Keep raw as "0"
        }
      }

      setBalance(BigInt(raw));
    } catch {
      setBalance(0n);
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, ownerAddress, chainId]);

  useEffect(() => {
    fetchBalance();
    const t = setInterval(fetchBalance, 15_000);
    return () => clearInterval(t);
  }, [fetchBalance]);

  return { balance, loading, refetch: fetchBalance };
}
