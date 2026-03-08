"use client";

import { useTransactionStatus } from "@/hooks/useTransactionStatus";
import { CHAIN_CONFIG } from "@/config/chains";
import { shortenAddress, cn } from "@/lib/utils";
import type { BridgeProvider, TransactionState } from "@/services/types";

interface TransactionStatusProps {
  txHash: string;
  provider: BridgeProvider;
  fromChain: number;
  toChain: number;
  onClose: () => void;
}

const STATE_CONFIG: Record<
  TransactionState,
  { label: string; color: string; icon: string }
> = {
  idle: { label: "Ready", color: "var(--muted)", icon: "" },
  approving: { label: "Approving...", color: "var(--warning)", icon: "" },
  approved: { label: "Approved", color: "var(--accent)", icon: "" },
  bridging: { label: "Bridging...", color: "var(--warning)", icon: "" },
  pending: { label: "Submitted", color: "var(--warning)", icon: "" },
  confirming: { label: "Confirming...", color: "var(--primary)", icon: "" },
  attesting: { label: "Verifying...", color: "var(--primary)", icon: "" },
  completing: { label: "Completing...", color: "var(--primary)", icon: "" },
  done: { label: "Complete!", color: "var(--accent)", icon: "" },
  failed: { label: "Failed", color: "var(--danger)", icon: "" },
};

const STEPS: TransactionState[] = [
  "pending",
  "confirming",
  "attesting",
  "done",
];

export function TransactionStatusDisplay({
  txHash,
  provider,
  fromChain,
  toChain,
  onClose,
}: TransactionStatusProps) {
  const status = useTransactionStatus(txHash, provider, fromChain, toChain);

  const fromExplorer = CHAIN_CONFIG[fromChain]?.explorer;
  const toExplorer = CHAIN_CONFIG[toChain]?.explorer;

  const config = STATE_CONFIG[status.state] || STATE_CONFIG.pending;

  const currentStepIndex = STEPS.indexOf(status.state);

  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Transaction Status</h3>
        <button
          onClick={onClose}
          className="text-[var(--muted)] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const isActive = i <= currentStepIndex;
          const isCurrent = step === status.state;
          return (
            <div key={step} className="flex-1 flex items-center gap-1">
              <div
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all",
                  isActive
                    ? "bg-[var(--primary)]"
                    : "bg-[var(--border)]",
                  isCurrent && "pulse-glow"
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Status label */}
      <div className="text-center">
        <div
          className="text-lg font-semibold"
          style={{ color: config.color }}
        >
          {config.label}
        </div>
        {status.message && (
          <p className="text-xs text-[var(--muted)] mt-1">{status.message}</p>
        )}
      </div>

      {/* Transaction links */}
      <div className="space-y-2 text-xs">
        {status.sourceTxHash && fromExplorer && (
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)]">Source tx</span>
            <a
              href={`${fromExplorer}/tx/${status.sourceTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
            >
              {shortenAddress(status.sourceTxHash, 6)}
            </a>
          </div>
        )}
        {status.destinationTxHash && toExplorer && (
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)]">Destination tx</span>
            <a
              href={`${toExplorer}/tx/${status.destinationTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline transition-colors"
            >
              {shortenAddress(status.destinationTxHash, 6)}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
