"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/config/wagmi";

import { TronLinkProvider } from "@/contexts/TronLinkContext";
import { SolanaWalletProvider } from "@/contexts/SolanaWalletContext";
import { DamAutoConnect } from "@/components/DamAutoConnect";
import { useDamContext } from "@/hooks/useDamContext";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

function DamAutoConnectWrapper() {
  const damCtx = useDamContext();
  if (!damCtx.isDam) return null;
  return <DamAutoConnect provider={damCtx.provider} address={damCtx.walletAddress} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TronLinkProvider>
        <SolanaWalletProvider>
        <DamAutoConnectWrapper />
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#FF8800",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
          })}
        >
          {children}
        </RainbowKitProvider>
        </SolanaWalletProvider>
        </TronLinkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
