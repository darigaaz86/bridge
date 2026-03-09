"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { TRON_CHAIN_ID } from "@/config/chains";

interface TronLinkContextValue {
  tronAddress: string | null;
  isTronConnected: boolean;
  isTronAvailable: boolean;
  connectTron: () => Promise<void>;
  disconnectTron: () => void;
}

const TronLinkContext = createContext<TronLinkContextValue | null>(null);

export function TronLinkProvider({ children }: { children: React.ReactNode }) {
  const [tronAddress, setTronAddress] = useState<string | null>(null);
  const [isTronAvailable, setIsTronAvailable] = useState(false);

  const syncFromTronWeb = useCallback(() => {
    if (typeof window === "undefined" || !window.tronWeb) return;
    const addr = window.tronWeb.defaultAddress?.base58;
    if (addr) setTronAddress(addr);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasTron = !!(window.tronLink ?? window.tronWeb);
    setIsTronAvailable(hasTron);
    syncFromTronWeb();
    // Re-sync when window gains focus (e.g. user approved in extension)
    const onFocus = () => syncFromTronWeb();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [syncFromTronWeb]);

  const connectTron = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (window.tronLink?.request) {
      const res = await window.tronLink.request({
        method: "tron_requestAccounts",
      });
      if (res?.code === 200 && res.address?.[0]) {
        setTronAddress(res.address[0]);
      } else {
        throw new Error("TronLink connection denied or failed");
      }
      // Also sync from tronWeb in case extension updates it after approval
      if (window.tronWeb?.defaultAddress?.base58) {
        setTronAddress(window.tronWeb.defaultAddress.base58);
      }
    } else if (window.tronWeb?.defaultAddress?.base58) {
      setTronAddress(window.tronWeb.defaultAddress.base58);
    } else {
      throw new Error("TronLink not found. Install the TronLink extension.");
    }
  }, []);

  const disconnectTron = useCallback(() => {
    setTronAddress(null);
  }, []);

  const value: TronLinkContextValue = {
    tronAddress,
    isTronConnected: !!tronAddress,
    isTronAvailable,
    connectTron,
    disconnectTron,
  };

  return (
    <TronLinkContext.Provider value={value}>
      {children}
    </TronLinkContext.Provider>
  );
}

export function useTronLink(): TronLinkContextValue {
  const ctx = useContext(TronLinkContext);
  if (!ctx) {
    return {
      tronAddress: null,
      isTronConnected: false,
      isTronAvailable: false,
      connectTron: async () => {},
      disconnectTron: () => {},
    };
  }
  return ctx;
}

export { TRON_CHAIN_ID };
