"use client";

import { useTokenBalance } from "@/hooks/useTokenBalance";
import { getTokenAddress } from "@/config/tokens";
import { formatAmount, cn } from "@/lib/utils";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  token: string;
  chainId: number;
  label: string;
  readOnly?: boolean;
}

export function AmountInput({
  value,
  onChange,
  token,
  chainId,
  label,
  readOnly = false,
}: AmountInputProps) {
  const tokenAddress = getTokenAddress(token, chainId);
  const { balance } = useTokenBalance(tokenAddress, chainId);

  const handleMax = () => {
    if (balance > 0n) {
      const decimals = token === "USDC" || token === "USDT" || token === "USDT0" ? 6 : 18;
      onChange(formatAmount(balance, decimals, decimals));
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline gap-2">
        <label className="text-xs text-[var(--muted)] shrink-0">{label}</label>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)] min-w-0 justify-end">
          <span className="truncate">
            Balance:{" "}
            {tokenAddress
              ? formatAmount(balance, 6, 4)
              : "—"}
          </span>
          {!readOnly && balance > 0n && (
            <button
              type="button"
              onClick={handleMax}
              className="text-[var(--primary)] hover:text-[var(--primary-hover)] font-semibold transition-colors shrink-0"
            >
              MAX
            </button>
          )}
        </div>
      </div>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "" || /^\d*\.?\d*$/.test(val)) {
            onChange(val);
          }
        }}
        readOnly={readOnly}
        className={cn(
          "w-full bg-transparent text-2xl font-semibold text-white placeholder-[var(--muted)]/40 outline-none py-0.5",
          readOnly && "cursor-default opacity-80"
        )}
      />
    </div>
  );
}
