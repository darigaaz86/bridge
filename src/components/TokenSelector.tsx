"use client";

import { useState, useRef, useEffect } from "react";
import { getTokensForChain, type TokenConfig } from "@/config/tokens";
import { cn } from "@/lib/utils";

interface TokenSelectorProps {
  selectedToken: string;
  onSelect: (symbol: string) => void;
  chainId: number;
  label?: string;
}

const TOKEN_COLORS: Record<string, string> = {
  USDC: "#2775CA",
  USDT: "#26A17B",
  USDT0: "#26A17B",
};

export function TokenSelector({
  selectedToken,
  onSelect,
  chainId,
  label: labelText,
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const tokens = getTokensForChain(chainId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentToken = tokens.find((t) => t.symbol === selectedToken);

  return (
    <div className="relative flex flex-col" ref={dropdownRef}>
      {labelText && (
        <label className="text-xs text-[var(--muted)] mb-1 block">{labelText}</label>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 rounded-xl min-h-[44px] w-full min-w-0",
          "bg-[var(--card-hover)] border border-[var(--border)]",
          "hover:border-[var(--border-hover)] transition-colors",
          "text-white text-sm font-semibold text-left",
        )}
      >
        <div
          className="relative w-5 h-5 rounded-full flex-shrink-0 overflow-hidden"
          style={{
            backgroundColor: TOKEN_COLORS[selectedToken] || "#666",
          }}
        >
          {currentToken?.icon && (
            <img
              src={currentToken.icon}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.opacity = "0";
              }}
            />
          )}
        </div>
        <span>{currentToken?.symbol || selectedToken}</span>
        <svg
          className={cn(
            "w-3.5 h-3.5 transition-transform",
            isOpen && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-2xl z-50 overflow-hidden">
          {tokens.map((token) => (
            <button
              key={token.symbol}
              onClick={() => {
                onSelect(token.symbol);
                setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left text-sm",
                "hover:bg-[var(--card-hover)] transition-colors",
                token.symbol === selectedToken
                  ? "text-[var(--primary)] bg-[var(--primary)]/5"
                  : "text-white",
              )}
            >
<div
              className="relative w-6 h-6 rounded-full flex-shrink-0 overflow-hidden"
              style={{
                backgroundColor: TOKEN_COLORS[token.symbol] || "#666",
              }}
            >
              {token.icon && (
                <img
                  src={token.icon}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.opacity = "0";
                  }}
                />
              )}
            </div>
            <div>
                <div className="font-semibold">{token.symbol}</div>
                <div className="text-xs text-[var(--muted)]">{token.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
