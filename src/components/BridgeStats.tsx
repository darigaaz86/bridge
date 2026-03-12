"use client";

import { DEFAULT_SLIPPAGE_BPS, PLATFORM_FEE_BPS } from "@/config/constants";
import { bpsToPercent } from "@/lib/fees";

export function BridgeStats() {
  return (
    <div className="flex items-center gap-8 text-center">
      <div>
        <div className="text-xl font-bold text-white">8+</div>
        <div className="text-xs text-[var(--muted)]">Chains</div>
      </div>
      <div className="w-px h-8 bg-[var(--border)]" />
      <div>
        <div className="text-xl font-bold text-white">3</div>
        <div className="text-xs text-[var(--muted)]">Bridges</div>
      </div>
      <div className="w-px h-8 bg-[var(--border)]" />
      <div>
        <div className="text-xl font-bold text-white">{bpsToPercent(DEFAULT_SLIPPAGE_BPS)}</div>
        <div className="text-xs text-[var(--muted)]">Slippage</div>
      </div>
      <div className="w-px h-8 bg-[var(--border)]" />
      <div>
        <div className="text-xl font-bold text-[var(--accent)]">{PLATFORM_FEE_BPS} bps</div>
        <div className="text-xs text-[var(--muted)]">Fee</div>
      </div>
    </div>
  );
}
