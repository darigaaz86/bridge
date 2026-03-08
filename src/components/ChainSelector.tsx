"use client";

import { useState, useRef, useEffect } from "react";
import { CHAIN_CONFIG, getSupportedChainIds } from "@/config/chains";
import { cn } from "@/lib/utils";

interface ChainSelectorProps {
  selectedChainId: number;
  onSelect: (chainId: number) => void;
  excludeChainId?: number;
  label: string;
}

export function ChainSelector({
  selectedChainId,
  onSelect,
  excludeChainId,
  label,
}: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedChain = CHAIN_CONFIG[selectedChainId];
  const chainIds = getSupportedChainIds().filter(
    (id) => id !== excludeChainId
  );

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

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-xs text-[var(--muted)] mb-1 block">{label}</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl",
          "bg-[var(--card-hover)] border border-[var(--border)]",
          "hover:border-[var(--border-hover)] transition-all",
          "text-white text-sm font-medium min-w-[140px]"
        )}
      >
        <div
          className="w-5 h-5 rounded-full"
          style={{ backgroundColor: selectedChain?.color || "#666" }}
        />
        <span>{selectedChain?.name || "Select Chain"}</span>
        <svg
          className={cn(
            "w-4 h-4 ml-auto transition-transform",
            isOpen && "rotate-180"
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
        <div className="absolute top-full left-0 mt-2 w-56 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-2xl z-50 overflow-hidden">
          {chainIds.map((chainId) => {
            const chain = CHAIN_CONFIG[chainId];
            if (!chain) return null;
            return (
              <button
                key={chainId}
                onClick={() => {
                  onSelect(chainId);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left text-sm",
                  "hover:bg-[var(--card-hover)] transition-colors",
                  chainId === selectedChainId
                    ? "text-[var(--primary)] bg-[var(--primary)]/5"
                    : "text-white"
                )}
              >
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0"
                  style={{ backgroundColor: chain.color }}
                />
                <span className="font-medium">{chain.name}</span>
                {chainId === selectedChainId && (
                  <svg
                    className="w-4 h-4 ml-auto text-[var(--primary)]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
