"use client";

import { useEffect } from "react";
import { useConnect } from "wagmi";
import { useDamContext } from "@/hooks/useDamContext";
import { damWalletConnector } from "@/lib/damConnector";

export function DamAutoConnect() {
  const damCtx = useDamContext();
  const { connect } = useConnect();

  useEffect(() => {
    if (!damCtx.isDam || !damCtx.walletAddress) return;
    connect({
      connector: damWalletConnector({
        provider: damCtx.provider,
        address: damCtx.walletAddress as `0x${string}`,
      }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damCtx.isDam]);

  return null;
}
