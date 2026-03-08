"use client";

import { useTokenBalance } from "@/hooks/useTokenBalance";
import { getTokenAddress } from "@/config/tokens";
import { formatAmount } from "@/lib/utils";

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
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-[var(--muted)]">{label}</label>
        <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span>
            Balance:{" "}
            {tokenAddress
              ? formatAmount(balance, 6, 4)
              : "—"}
          </span>
          {!readOnly && balance > 0n && (
            <button
              onClick={handleMax}
              className="text-[var(--primary)] hover:text-[var(--primary-hover)] font-semibold transition-colors"
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
          // Allow only valid decimal input
          const val = e.target.value;
          if (val === "" || /^\d*\.?\d*$/.test(val)) {
            onChange(val);
          }
        }}
        readOnly={readOnly}
        className={`
          w-full bg-transparent text-2xl font-semibold text-white
          placeholder-[var(--muted)]/40 outline-none
          ${readOnly ? "cursor-default opacity-70" : ""}
        `}
      />
    </div>
  );
}
