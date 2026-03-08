import { Header } from "@/components/Header";
import { BridgeCard } from "@/components/BridgeCard";
import { BridgeStats } from "@/components/BridgeStats";

export default function Home() {
  return (
    <div className="min-h-screen gradient-bg">
      <Header />

      <main className="flex flex-col items-center justify-center px-4 py-12 sm:py-20">
        {/* Hero Text */}
        <div className="text-center mb-8 max-w-lg">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            Bridge Stablecoins
            <span className="block text-[var(--primary)]">
              Across Chains
            </span>
          </h1>
          <p className="text-sm text-[var(--muted)]">
            QoreBridge finds the best rates to bridge USDC and USDT across Ethereum, Arbitrum, Base, and more via CCTP, LayerZero, and NEAR Intents.
          </p>
        </div>

        {/* Bridge Card */}
        <BridgeCard />

        {/* Stats (reflect current settings) */}
        <div className="mt-12">
          <BridgeStats />
        </div>
      </main>
    </div>
  );
}
