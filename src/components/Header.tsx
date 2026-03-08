"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();

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

        {/* Wallet Connect */}
        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus="address"
        />
      </div>
    </header>
  );
}
