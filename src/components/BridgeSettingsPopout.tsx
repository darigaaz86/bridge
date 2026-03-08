"use client";

import { useEffect } from "react";
import { useBridgeSettings } from "@/contexts/BridgeSettingsContext";
import { MAX_SLIPPAGE_BPS } from "@/config/constants";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-lg bg-[var(--card-hover)] border border-[var(--border)] px-3 py-2 text-white text-sm focus:border-[var(--primary)] focus:outline-none";

export function BridgeSettingsPopout() {
  const { settings, updateSettings, resetSettings, isSettingsOpen, closeSettings } =
    useBridgeSettings();

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    if (isSettingsOpen) {
      document.addEventListener("keydown", onEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [isSettingsOpen, closeSettings]);

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeSettings}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto glass-card p-5 space-y-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex items-center justify-between sticky top-0 bg-[var(--card)]/95 backdrop-blur py-1 -mt-1">
          <h2 id="settings-title" className="text-lg font-semibold text-white">
            Bridge Settings
          </h2>
          <button
            type="button"
            onClick={closeSettings}
            className="p-2 rounded-lg hover:bg-[var(--card-hover)] text-[var(--muted)] hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-[var(--muted)]">
          Configure fees, slippage, and polling intervals. Values are saved automatically.
        </p>

        {/* Platform fee */}
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">Platform fee (bps)</label>
          <p className="text-xs text-[var(--muted)] mb-1">1 bps = 0.01%. Applied to the transfer amount.</p>
          <input
            type="number"
            min={0}
            max={1000}
            value={settings.platformFeeBps}
            onChange={(e) =>
              updateSettings({
                platformFeeBps: Math.min(1000, Math.max(0, Number(e.target.value) || 0)),
              })
            }
            className={inputClass}
          />
        </div>

        {/* Slippage */}
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">Slippage tolerance (bps)</label>
          <p className="text-xs text-[var(--muted)] mb-1">
            Max {MAX_SLIPPAGE_BPS} bps (5%). Used for NEAR Intents and route quotes.
          </p>
          <input
            type="number"
            min={0}
            max={MAX_SLIPPAGE_BPS}
            value={settings.slippageBps}
            onChange={(e) =>
              updateSettings({
                slippageBps: Math.min(MAX_SLIPPAGE_BPS, Math.max(0, Number(e.target.value) || 0)),
              })
            }
            className={inputClass}
          />
        </div>

        {/* Quote refresh */}
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Quote refresh interval (seconds)
          </label>
          <p className="text-xs text-[var(--muted)] mb-1">How often to refetch bridge quotes (5–120s).</p>
          <input
            type="number"
            min={5}
            max={120}
            value={Math.round(settings.quoteRefreshIntervalMs / 1000)}
            onChange={(e) => {
              const sec = Math.min(120, Math.max(5, Number(e.target.value) || 5));
              updateSettings({ quoteRefreshIntervalMs: sec * 1000 });
            }}
            className={inputClass}
          />
        </div>

        {/* Transaction status poll */}
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Transaction status poll interval (seconds)
          </label>
          <p className="text-xs text-[var(--muted)] mb-1">
            How often to check in-flight bridge status (2–60s).
          </p>
          <input
            type="number"
            min={2}
            max={60}
            value={Math.round(settings.statusPollIntervalMs / 1000)}
            onChange={(e) => {
              const sec = Math.min(60, Math.max(2, Number(e.target.value) || 2));
              updateSettings({ statusPollIntervalMs: sec * 1000 });
            }}
            className={inputClass}
          />
        </div>

        {/* History status poll */}
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            History status poll interval (seconds)
          </label>
          <p className="text-xs text-[var(--muted)] mb-1">
            How often to check pending history entries (5–120s).
          </p>
          <input
            type="number"
            min={5}
            max={120}
            value={Math.round(settings.historyStatusPollIntervalMs / 1000)}
            onChange={(e) => {
              const sec = Math.min(120, Math.max(5, Number(e.target.value) || 5));
              updateSettings({ historyStatusPollIntervalMs: sec * 1000 });
            }}
            className={inputClass}
          />
        </div>

        {/* CCTP default speed */}
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">CCTP default speed</label>
          <p className="text-xs text-[var(--muted)] mb-2">
            Default when CCTP is available: Fast (~30s, small fee) or Standard (~15m, no protocol fee).
          </p>
          <div className="flex rounded-lg bg-[var(--card-hover)] p-0.5 border border-[var(--border)]">
            <button
              type="button"
              onClick={() => updateSettings({ cctpDefaultFast: false })}
              className={cn(
                "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                !settings.cctpDefaultFast ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:text-white"
              )}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ cctpDefaultFast: true })}
              className={cn(
                "flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                settings.cctpDefaultFast ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:text-white"
              )}
            >
              Fast
            </button>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-4 flex gap-3">
          <button
            type="button"
            onClick={resetSettings}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card-hover)] hover:text-white transition-colors"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={closeSettings}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
