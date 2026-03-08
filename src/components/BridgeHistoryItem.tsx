"use client";

import { useState, useEffect, useCallback } from "react";
import { CHAIN_CONFIG } from "@/config/chains";
import { PROVIDER_NAMES } from "@/config/constants";
import { useBridgeSettings } from "@/contexts/BridgeSettingsContext";
import { formatAmount, shortenAddress, cn } from "@/lib/utils";
import { getAdapter } from "@/services/router";
import type { BridgeHistoryEntry } from "@/lib/bridgeHistory";
import type { TransactionStatus } from "@/services/types";

interface BridgeHistoryItemProps {
  entry: BridgeHistoryEntry;
  onStatusUpdate?: (
    id: string,
    updates: {
      status: "pending" | "done" | "failed";
      destinationTxHash?: string;
      failureMessage?: string;
    }
  ) => void;
}

const STATUS_STYLE: Record<
  "pending" | "done" | "failed",
  { label: string; className: string }
> = {
  pending: {
    label: "In progress",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  done: {
    label: "Completed",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/20 text-red-400 border-red-500/40",
  },
};

export function BridgeHistoryItem({ entry, onStatusUpdate }: BridgeHistoryItemProps) {
  const { settings } = useBridgeSettings();
  const [expanded, setExpanded] = useState(false);
  const [liveStatus, setLiveStatus] = useState<TransactionStatus | null>(null);
  const adapter = getAdapter(entry.provider);
  const fromChain = CHAIN_CONFIG[entry.fromChain];
  const toChain = CHAIN_CONFIG[entry.toChain];
  const fromExplorer = fromChain?.explorer;
  const toExplorer = toChain?.explorer;

  const amountFormatted = formatAmount(BigInt(entry.amount), 6, 4);
  const dateStr = new Date(entry.createdAt).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const statusStyle = STATUS_STYLE[entry.status];

  const fetchStatus = useCallback(() => {
    if (!adapter) return;
    adapter
      .getStatus(entry.sourceTxHash, entry.fromChain, entry.toChain)
      .then((s) => {
        setLiveStatus(s);
        if (s.state === "done" && entry.status !== "done" && onStatusUpdate) {
          onStatusUpdate(entry.id, {
            status: "done",
            destinationTxHash: s.destinationTxHash,
          });
        }
        if (s.state === "failed" && entry.status !== "failed" && onStatusUpdate) {
          onStatusUpdate(entry.id, {
            status: "failed",
            failureMessage: s.message,
          });
        }
      })
      .catch(() => {
        setLiveStatus((prev) => prev ?? { state: "pending", message: "Could not fetch status" });
      });
  }, [adapter, entry.sourceTxHash, entry.fromChain, entry.toChain, entry.id, entry.status, onStatusUpdate]);

  // Poll for pending entries so "In progress" updates to "Completed" (interval from settings)
  useEffect(() => {
    if (entry.status !== "pending" || !adapter) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, settings.historyStatusPollIntervalMs);
    return () => clearInterval(interval);
  }, [entry.status, adapter, fetchStatus, settings.historyStatusPollIntervalMs]);

  // Fetch live status when expanded (so details show up)
  useEffect(() => {
    if (expanded && adapter) fetchStatus();
  }, [expanded, adapter, fetchStatus]);

  const needsRefundOrClaim =
    entry.status === "failed" ||
    (liveStatus?.state === "confirming" &&
      liveStatus?.message?.toLowerCase().includes("insufficient"));

  return (
    <div className="rounded-xl bg-[var(--card-hover)] border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-[var(--card-hover)]/80 transition-colors"
      >
        <div
          className={cn(
            "shrink-0 w-2 h-2 rounded-full",
            entry.status === "done" && "bg-emerald-400",
            entry.status === "failed" && "bg-red-400",
            entry.status === "pending" && "bg-amber-400 animate-pulse"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white font-medium">
              {fromChain?.shortName ?? entry.fromChain} → {toChain?.shortName ?? entry.toChain}
            </span>
            <span className="text-[var(--muted)]">{entry.fromToken}</span>
            <span className="text-white">{amountFormatted}</span>
          </div>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            {PROVIDER_NAMES[entry.provider]} · {dateStr}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 text-xs font-medium px-2 py-1 rounded-md border",
            statusStyle.className
          )}
        >
          {statusStyle.label}
        </span>
        <svg
          className={cn("w-4 h-4 text-[var(--muted)] shrink-0 transition-transform", expanded && "rotate-180")}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] p-4 space-y-4 bg-[var(--card)]/50">
          {/* Live status */}
          {liveStatus && (
            <div>
              <div className="text-xs font-medium text-[var(--muted)] mb-1">Current status</div>
              <p className="text-sm text-white">
                {liveStatus.message ?? liveStatus.state}
              </p>
            </div>
          )}

          {/* Tx links */}
          <div className="flex flex-wrap gap-4 text-sm">
            {fromExplorer && (
              <a
                href={`${fromExplorer}/tx/${entry.sourceTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                Source tx {shortenAddress(entry.sourceTxHash, 6)}
              </a>
            )}
            {entry.destinationTxHash && toExplorer && (
              <a
                href={`${toExplorer}/tx/${entry.destinationTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Destination tx {shortenAddress(entry.destinationTxHash, 6)}
              </a>
            )}
          </div>

          {/* Refund / Claim section when failed or stuck */}
          {needsRefundOrClaim && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <div className="text-sm font-medium text-amber-400">
                {entry.status === "failed" ? "Transfer failed" : "Action may be required"}
              </div>
              {entry.provider === "cctp" && (
                <p className="text-xs text-[var(--muted)]">
                  If the transfer did not complete (e.g. insufficient fee or attestation delay), you can claim USDC on
                  the destination chain by calling the CCTP Message Transmitter contract there. You will need native gas
                  on the destination chain. See{" "}
                  <a
                    href="https://developers.circle.com/cctp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--primary)] hover:underline"
                  >
                    Circle CCTP docs
                  </a>{" "}
                  for contract addresses and claim steps.
                </p>
              )}
              {entry.provider === "usdt0" && (
                <p className="text-xs text-[var(--muted)]">
                  For failed LayerZero transfers, check the destination chain for any claim or retry options, or
                  contact the bridge provider. See{" "}
                  <a
                    href="https://layerzero.network"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--primary)] hover:underline"
                  >
                    LayerZero
                  </a>{" "}
                  for more info.
                </p>
              )}
              {entry.failureMessage && (
                <p className="text-xs text-[var(--muted)]">Details: {entry.failureMessage}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
