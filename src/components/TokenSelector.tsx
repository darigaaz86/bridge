"use client";

import { useState, useRef, useEffect } from "react";
import { useTokens } from "@/hooks/useTokens";
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
  ETH: "#627EEA",
  WETH: "#627EEA",
  WBTC: "#F09242",
  cbBTC: "#0052FF",
  BTC: "#F7931A",
  DAI: "#F5AC37",
  ARB: "#12AAFF",
  SOL: "#9945FF",
  LINK: "#2A5ADA",
  UNI: "#FF007A",
  AAVE: "#B6509E",
  GMX: "#2D42FC",
  OP: "#FF0420",
  BNB: "#F3BA2F",
  TRUMP: "#C8A96E",
  TURBO: "#4ADE80",
  KNC: "#31CB9E",
  SAFE: "#12FF80",
  XAUT: "#E6C44D",
  ZEC: "#ECB244",
  AURORA: "#70D44B",
  MOG: "#B8860B",
  SPX: "#FF6B35",
  BRETT: "#0052FF",
  PENGU: "#3B82F6",
  BOME: "#FF4500",
  KAITO: "#6366F1",
  MELANIA: "#D4AF37",
  SWEAT: "#FF6B00",
  USD1: "#1A1A2E",
  INX: "#7C3AED",
  TRX: "#FF0013",
  NEAR: "#00C08B",
  PEPE: "#3D9B3D",
  SHIB: "#FFA409",
  WIF: "#A0522D",
  "$WIF": "#A0522D",
};

// CoinGecko CDN fallback icons for well-known tokens (same CDN the project uses)
const CG = "https://coin-images.coingecko.com/coins/images";
const FALLBACK_ICONS: Record<string, string> = {
  USDC: `${CG}/6319/small/usdc.png`,
  USDT: `${CG}/325/small/tether.png`,
  USDT0: `${CG}/325/small/tether.png`,
  ETH: `${CG}/279/small/ethereum.png`,
  WETH: `${CG}/2518/small/weth.png`,
  WBTC: `${CG}/7598/small/wrapped_bitcoin_wbtc.png`,
  cbBTC: `${CG}/36015/small/cbbtc.png`,
  BTC: `${CG}/1/small/bitcoin.png`,
  DAI: `${CG}/9956/small/Badge_Dai.png`,
  ARB: `${CG}/16547/small/arb.png`,
  SOL: `${CG}/4128/small/solana.png`,
  LINK: `${CG}/877/small/chainlink-new-logo.png`,
  UNI: `${CG}/12504/small/uni.png`,
  AAVE: `${CG}/12645/small/aave-token.png`,
  PEPE: `${CG}/33957/small/pepe-token.png`,
  SHIB: `${CG}/11939/small/shiba.png`,
  GMX: `${CG}/18323/small/arbit.png`,
  OP: `${CG}/25244/small/Token.png`,
  BNB: `${CG}/825/small/bnb-icon2_2x.png`,
  TRUMP: `${CG}/53746/small/trump.png`,
  TURBO: `${CG}/30117/small/TurboMark-QL_200.png`,
  KNC: `${CG}/14899/small/RwdVsGcw_400x400.jpg`,
  SAFE: `${CG}/27032/small/Artboard_1_copy_8circle-1.png`,
  XAUT: `${CG}/10481/small/logo.png`,
  ZEC: `${CG}/486/small/circle-zcash-color.png`,
  AURORA: `${CG}/20582/small/aurora.jpeg`,
  MOG: `${CG}/31059/small/MOG_LOGO_200x200.png`,
  SPX: `${CG}/31401/small/centeredcoin_%281%29.png`,
  BRETT: `${CG}/35529/small/1000050750.png`,
  PENGU: `${CG}/52622/small/PUDGY_PENGUINS_PENGU_PFP.png`,
  BOME: `${CG}/36071/small/bome.png`,
  KAITO: `${CG}/54411/small/Qm4DW488_400x400.jpg`,
  MELANIA: `${CG}/53775/small/melania-meme.png`,
  SWEAT: `${CG}/25057/small/Sweat_-_logo-nov-2025.png`,
  USD1: `${CG}/54977/small/USD1_1000x1000_transparent.png`,
  INX: `${CG}/70868/small/infinex.png`,
  TRX: `${CG}/1094/small/photo_2026-04-13_09-59-16.png`,
  NEAR: `${CG}/10365/small/near.png`,
  WIF: `${CG}/33566/small/dogwifhat.jpg`,
  "$WIF": `${CG}/33566/small/dogwifhat.jpg`,
};

export function TokenSelector({
  selectedToken,
  onSelect,
  chainId,
  label: labelText,
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { tokens, isLoading } = useTokens(chainId);

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
          {(currentToken?.icon || FALLBACK_ICONS[selectedToken]) && (
            <img
              src={currentToken?.icon || FALLBACK_ICONS[selectedToken]}
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
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-[var(--muted)] border-b border-[var(--border)]">
              <svg
                className="w-3 h-3 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span>Loading tokens…</span>
            </div>
          )}
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
              {(token.icon || FALLBACK_ICONS[token.symbol]) && (
                <img
                  src={token.icon || FALLBACK_ICONS[token.symbol]}
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
