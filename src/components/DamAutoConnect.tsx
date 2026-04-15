"use client";

import { useEffect } from "react";
import { useConnect } from "wagmi";
import { damWalletConnector } from "@/lib/damConnector";
import type { EIP1193Provider } from "@/lib/miniAppSdk";

interface DamAutoConnectProps {
  provider: EIP1193Provider;
  address: string;
}

export function DamAutoConnect({ provider, address }: DamAutoConnectProps) {
  const { connect } = useConnect();

  useEffect(() => {
    if (!address) return;
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
