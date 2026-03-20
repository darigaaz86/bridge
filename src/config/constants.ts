// Quote refresh interval in milliseconds
export const QUOTE_REFRESH_INTERVAL = 15_000; // 15 seconds

// Debounce delay for amount input (ms)
export const QUOTE_DEBOUNCE_MS = 500;

// Maximum slippage tolerance (bps)
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const MAX_SLIPPAGE_BPS = 500; // 5%

// Transaction status polling interval (ms)
export const STATUS_POLL_INTERVAL = 5_000; // 5 seconds

// Bridge history: poll pending entries every 10s to detect completion
export const HISTORY_STATUS_POLL_INTERVAL_MS = 10_000;

// Bridge provider names
export const PROVIDER_NAMES = {
  cctp: "Circle CCTP",
  usdt0: "USDT0 (LayerZero)",
  "near-intents": "NEAR Intents",
} as const;

// WalletConnect Project ID (get yours at https://cloud.walletconnect.com)
export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID";
