"use client";

import { useState, useEffect } from "react";
import { miniAppSdk } from "@/lib/miniAppSdk";
import type { EIP1193Provider } from "@/lib/miniAppSdk";

export type DamContext =
  | { isDam: false }
  | { isDam: true; walletAddress: string; provider: EIP1193Provider }

let cached: DamContext | null = null

export function useDamContext(): DamContext {
  const [ctx, setCtx] = useState<DamContext>(cached ?? { isDam: false })

  useEffect(() => {
    if (cached !== null) {
      setCtx(cached)
      return
    }

    miniAppSdk.getContext().then((context) => {
      if (!context.granted_scopes.includes('wallet:sign')) {
        cached = { isDam: false }
        setCtx(cached)
        return
      }
      const addresses = context.wallet?.addresses ?? []
      const walletAddress = addresses[0] ?? ''
      const provider = miniAppSdk.getWalletProvider()
      cached = { isDam: true, walletAddress, provider }
      setCtx(cached)
    }).catch(() => {
      cached = { isDam: false }
      setCtx(cached)
    })
  }, [])

  return ctx
}
