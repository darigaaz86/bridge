"use client";

import { formatAmount, formatTime } from "@/lib/utils";
import type { BridgeQuote } from "@/services/types";

interface FeeBreakdownProps {
  quote: BridgeQuote;
  fromToken: string;
  toToken: string;
  feeBps: number;
  fromDecimals?: number;
  toDecimals?: number;
}

export function FeeBreakdown({ quote, fromToken, toToken, feeBps, fromDecimals = 6, toDecimals = 6 }: FeeBreakdownProps) {
  const platformFee = (quote.inputAmount * BigInt(feeBps)) / 10000n;
  const feePercent = (feeBps / 100).toFixed(2);

  return (
    <div className="rounded-xl bg-[var(--card-hover)]/60 border border-[var(--border)] p-4 space-y-2.5 text-xs">
      <div className="flex justify-between text-[var(--muted)]">
        <span>Platform fee ({feePercent}%)</span>
        <span className="text-white">
          {formatAmount(platformFee, fromDecimals, 4)} {fromToken}
        </span>
      </div>

      {quote.bridgeFee > 0n && (
        <div className="flex justify-between text-[var(--muted)]">
          <span>Bridge fee</span>
          <span className="text-white">
            {formatAmount(quote.bridgeFee, fromDecimals, 4)} {fromToken}
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

      {quote.provider === "cctp" && quote.bridgeFee > 0n && (
        <div className="flex justify-between font-medium text-[var(--primary)]">
          <span>Total from wallet</span>
          <span>{formatAmount(quote.inputAmount, fromDecimals, 4)} {fromToken}</span>
        </div>
      )}

      <div className="border-t border-[var(--border)] my-1" />

      <div className="flex justify-between font-medium">
        <span className="text-[var(--muted)]">You receive</span>
        <span className="text-white text-sm">
          {formatAmount(quote.outputAmount, toDecimals, 4)} {toToken}
        </span>
      </div>
    </div>
  );
}
