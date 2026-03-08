"use client";

import { formatAmount, formatTime } from "@/lib/utils";
import { bpsToPercent } from "@/lib/fees";
import { useBridgeSettings } from "@/contexts/BridgeSettingsContext";
import type { BridgeQuote } from "@/services/types";

interface FeeBreakdownProps {
  quote: BridgeQuote;
}

export function FeeBreakdown({ quote }: FeeBreakdownProps) {
  const { settings } = useBridgeSettings();
  return (
    <div className="rounded-xl bg-[var(--card-hover)]/50 border border-[var(--border)] p-3 space-y-2 text-xs">
      <div className="flex justify-between text-[var(--muted)]">
        <span>Platform fee ({bpsToPercent(settings.platformFeeBps)})</span>
        <span className="text-white">
          {formatAmount(quote.platformFee, 6, 4)} {quote.provider === "cctp" ? "USDC" : "USDT"}
        </span>
      </div>

      {quote.bridgeFee > 0n && (
        <div className="flex justify-between text-[var(--muted)]">
          <span>Bridge fee</span>
          <span className="text-white">
            {formatAmount(quote.bridgeFee, 6, 4)}
          </span>
        </div>
      )}

      {quote.bridgeFee === 0n && (
        <div className="flex justify-between text-[var(--muted)]">
          <span>Bridge fee</span>
          <span className="text-[var(--accent)]">Free</span>
        </div>
      )}

      <div className="flex justify-between text-[var(--muted)]">
        <span>Estimated time</span>
        <span className="text-white">{formatTime(quote.estimatedTime)}</span>
      </div>

      {/* CCTP: total debited = receive amount + bridge fee; show so wallet approval amount isn't a surprise */}
      {quote.provider === "cctp" && quote.bridgeFee > 0n && (
        <div className="flex justify-between font-medium text-[var(--primary)]">
          <span>Total from wallet</span>
          <span>{formatAmount(quote.inputAmount, 6, 4)} USDC</span>
        </div>
      )}

      <div className="border-t border-[var(--border)] my-1" />

      <div className="flex justify-between font-medium">
        <span className="text-[var(--muted)]">You receive</span>
        <span className="text-white text-sm">
          {formatAmount(quote.outputAmount, 6, 4)}{" "}
          {quote.provider === "cctp" ? "USDC" : "USDT"}
        </span>
      </div>
    </div>
  );
}
