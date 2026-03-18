"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Header } from "@/components/Header";
import { BridgeHistoryItem } from "@/components/BridgeHistoryItem";
import { useBridgeHistory } from "@/hooks/useBridgeHistory";

export default function HistoryPage() {
  const { address, isConnected } = useAccount();
  const { history, refreshFromStorage } = useBridgeHistory();

  return (
    <div className="min-h-screen gradient-bg">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Bridge History</h1>
          <Link
            href="/"
            className="text-sm text-[var(--muted)] hover:text-white transition-colors"
          >
            ← Back to Bridge
          </Link>
        </div>

        {!isConnected ? (
          <div className="glass-card p-8 text-center">
            <p className="text-[var(--muted)] mb-4">
              Connect your wallet to view your bridge history.
            </p>
            <ConnectButton />
          </div>
        ) : history.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-[var(--muted)] mb-2">No bridge transactions yet.</p>
            <p className="text-sm text-[var(--muted)] mb-4">
              Your completed and in-progress transfers will appear here.
            </p>
            <Link
              href="/"
              className="text-[var(--primary)] hover:underline text-sm font-medium"
            >
              Start a bridge →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
              <span>{history.length} transaction{history.length !== 1 ? "s" : ""}</span>
              <button
                type="button"
                onClick={refreshFromStorage}
                className="hover:text-white transition-colors"
              >
                Refresh
              </button>
            </div>
            {history.map((entry) => (
              <BridgeHistoryItem
                key={entry.id}
                entry={entry}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
