"use client";

import { useEffect, useRef } from "react";
import { useConnect } from "wagmi";
import { damWalletConnector } from "@/lib/damConnector";
import type { EIP1193Provider } from "@/lib/miniAppSdk";

interface DamAutoConnectProps {
  provider: EIP1193Provider;
  address: string;
}

export function DamAutoConnect({ provider, address }: DamAutoConnectProps) {
  const { connect } = useConnect();
  const hasConnected = useRef(false);

  useEffect(() => {
    if (hasConnected.current) return;
    hasConnected.current = true;
    connect({
      connector: damWalletConnector({
        provider,
        address: address as `0x${string}`,
      }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
