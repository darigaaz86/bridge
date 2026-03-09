"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cn, shortenAddress } from "@/lib/utils";
import { useTronLink } from "@/contexts/TronLinkContext";
import { CHAIN_CONFIG } from "@/config/chains";
import { TRON_CHAIN_ID } from "@/config/chains";

const walletButtonClass =
  "flex items-center gap-2 h-10 min-w-[140px] rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--card-hover)]";

export function Header() {
  const pathname = usePathname();
  const { tronAddress, isTronConnected, isTronAvailable, connectTron, disconnectTron } = useTronLink();
  const tronConfig = CHAIN_CONFIG[TRON_CHAIN_ID];

  return (
    <header className="w-full border-b border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo / Brand */}
        <Link href="/" className="flex items-center gap-2" aria-label="QoreBridge home">
          <img
            src="https://www.qore3.com/images/qore3-logo.svg"
            alt="QoreBridge"
            className="h-6 w-auto"
          />
          <span className="text-lg font-semibold text-white hidden sm:inline">
            Qore<span className="text-[var(--primary)]">Bridge</span>
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="hidden sm:flex items-center gap-6 text-sm text-[var(--muted)]">
          <Link
            href="/"
            className={cn(
              "transition-colors",
              pathname === "/" ? "text-white font-medium" : "hover:text-white"
            )}
          >
            Bridge
          </Link>
          <Link
            href="/history"
            className={cn(
              "transition-colors",
              pathname === "/history" ? "text-white font-medium" : "hover:text-white"
            )}
          >
            History
          </Link>
          <a href="#" className="hover:text-white transition-colors">
            Docs
          </a>
        </nav>

        {/* Wallet Connect: Tron + EVM (same style for both) */}
        <div className="flex items-center gap-2">
          {isTronConnected && tronAddress ? (
            <div
              className={cn(walletButtonClass, "justify-between")}
              title={tronAddress}
            >
              <div className="flex items-center gap-2 min-w-0">
                {tronConfig?.icon && (
                  <div
                    className="relative w-6 h-6 rounded-full flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: tronConfig.color }}
                  >
                    <img
                      src={tronConfig.icon}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <span className="tabular-nums truncate">{shortenAddress(tronAddress, 4)}</span>
              </div>
              <button
                type="button"
                onClick={disconnectTron}
                className="text-[var(--muted)] hover:text-white transition-colors p-0.5 shrink-0"
                title="Disconnect TronLink"
              >
                <span className="sr-only">Disconnect</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => connectTron().catch(() => {})}
              disabled={!isTronAvailable}
              className={cn(walletButtonClass, "justify-center", !isTronAvailable && "opacity-50 cursor-not-allowed")}
            >
              {tronConfig?.icon && (
                <div
                  className="relative w-6 h-6 rounded-full flex-shrink-0 overflow-hidden"
                  style={{ backgroundColor: tronConfig?.color ?? "#FF0013" }}
                >
                  <img
                    src={tronConfig.icon}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              {isTronAvailable ? "Connect Tron" : "Tron"}
            </button>
          )}
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus="address"
          />
        </div>
      </div>
    </header>
  );
}
