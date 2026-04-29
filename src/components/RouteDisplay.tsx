"use client";

import { formatAmount, formatTime, cn } from "@/lib/utils";
import type { BridgeQuote } from "@/services/types";

interface RouteDisplayProps {
  quotes: BridgeQuote[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  isLoading: boolean;
  fromDecimals?: number;
  toDecimals?: number;
}

const PROVIDER_ICONS: Record<string, string> = {
  cctp: "C",
  usdt0: "U",
  "near-intents": "N",
  across: "A",
};

const PROVIDER_COLORS: Record<string, string> = {
  cctp: "#3693FF",
  usdt0: "#26A17B",
  "near-intents": "#00EC97",
  across: "#6CF9D8",
};

export function RouteDisplay({
  quotes,
  selectedIndex,
  onSelect,
  isLoading,
  fromDecimals = 6,
  toDecimals = 6,
}: RouteDisplayProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-[var(--muted)] mb-2">Finding best routes...</div>
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] p-3 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--border)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-[var(--border)] rounded w-3/4" />
                <div className="h-2.5 bg-[var(--border)] rounded w-1/2" />
              </div>
              <div className="h-5 bg-[var(--border)] rounded w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (quotes.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs text-[var(--muted)] mb-2">
        {quotes.length} route{quotes.length > 1 ? "s" : ""} found
      </div>
      {quotes.map((quote, index) => (
        <button
          key={`${quote.provider}-${index}`}
          onClick={() => onSelect(index)}
          className={cn(
            "w-full rounded-xl border p-3 text-left transition-all",
            index === selectedIndex
              ? "border-[var(--primary)] bg-[var(--primary)]/5"
              : "border-[var(--border)] hover:border-[var(--border-hover)] bg-transparent"
          )}
        >
          <div className="flex items-center gap-3">
            {/* Provider icon */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: PROVIDER_COLORS[quote.provider] || "#666" }}
            >
              {PROVIDER_ICONS[quote.provider] || "?"}
            </div>

            {/* Route info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {quote.providerName}
                </span>
                {index === 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                    BEST
                  </span>
                )}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5 flex items-center gap-3">
                <span>{formatTime(quote.estimatedTime)}</span>
                <span>Fee: {formatAmount(quote.bridgeFee, fromDecimals, 4)}</span>
              </div>
            </div>

            {/* Output amount */}
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-semibold text-white">
                {formatAmount(quote.outputAmount, toDecimals, 4)}
              </div>
              {quote.bridgeFee > 0n && (
                <div className="text-[10px] text-[var(--muted)]">
                  Bridge fee: {formatAmount(quote.bridgeFee, fromDecimals, 4)}
                </div>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
