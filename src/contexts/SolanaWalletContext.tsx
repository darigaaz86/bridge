"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";

interface SolanaWalletContextValue {
  solanaAddress: string | null;
  isSolanaConnected: boolean;
  isSolanaAvailable: boolean;
  connectSolana: () => Promise<void>;
  disconnectSolana: () => void;
  /** The raw wallet adapter instance — passed to ExecuteContext for signing */
  solanaWallet: WalletContextState | null;
}

const SolanaWalletContext = createContext<SolanaWalletContextValue | null>(null);

const endpoint = clusterApiUrl("mainnet-beta");

const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
];

/**
 * Inner component that reads from the wallet-adapter context
 * and exposes a simplified interface matching the TronLink pattern.
 */
function SolanaWalletInner({ children }: { children: React.ReactNode }) {
  const walletState = useWallet();

  const solanaAddress = walletState.publicKey?.toBase58() ?? null;
  const isSolanaConnected = walletState.connected;
  const isSolanaAvailable = walletState.wallets.length > 0;

  const connectSolana = useCallback(async () => {
    // If a wallet is already selected, just connect
    if (walletState.wallet) {
      await walletState.connect();
      return;
    }
    // Auto-select the first available installed wallet
    const installed = walletState.wallets.find(
      (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable
    );
    if (installed) {
      walletState.select(installed.adapter.name);
      // connect() will be triggered by autoConnect or the adapter after select
      await walletState.connect();
    } else {
      throw new Error("No Solana wallet found. Install Phantom or Solflare.");
    }
  }, [walletState]);

  const disconnectSolana = useCallback(() => {
    walletState.disconnect();
  }, [walletState]);

  const value: SolanaWalletContextValue = useMemo(
    () => ({
      solanaAddress,
      isSolanaConnected,
      isSolanaAvailable,
      connectSolana,
      disconnectSolana,
      solanaWallet: isSolanaConnected ? walletState : null,
    }),
    [
      solanaAddress,
      isSolanaConnected,
      isSolanaAvailable,
      connectSolana,
      disconnectSolana,
      walletState,
    ]
  );

  return (
    <SolanaWalletContext.Provider value={value}>
      {children}
    </SolanaWalletContext.Provider>
  );
}

export function SolanaWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <SolanaWalletInner>{children}</SolanaWalletInner>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function useSolanaWallet(): SolanaWalletContextValue {
  const ctx = useContext(SolanaWalletContext);
  if (!ctx) {
    return {
      solanaAddress: null,
      isSolanaConnected: false,
      isSolanaAvailable: false,
      connectSolana: async () => {},
      disconnectSolana: () => {},
      solanaWallet: null,
    };
  }
  return ctx;
}
