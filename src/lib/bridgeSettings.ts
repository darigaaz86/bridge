import {
  PLATFORM_FEE_BPS,
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  QUOTE_REFRESH_INTERVAL,
  STATUS_POLL_INTERVAL,
  HISTORY_STATUS_POLL_INTERVAL_MS,
} from "@/config/constants";

const STORAGE_KEY = "qorebridge_settings";

export interface BridgeSettings {
  platformFeeBps: number;
  slippageBps: number;
  quoteRefreshIntervalMs: number;
  statusPollIntervalMs: number;
  historyStatusPollIntervalMs: number;
  cctpDefaultFast: boolean;
}

const DEFAULTS: BridgeSettings = {
  platformFeeBps: PLATFORM_FEE_BPS,
  slippageBps: DEFAULT_SLIPPAGE_BPS,
  quoteRefreshIntervalMs: QUOTE_REFRESH_INTERVAL,
  statusPollIntervalMs: STATUS_POLL_INTERVAL,
  historyStatusPollIntervalMs: HISTORY_STATUS_POLL_INTERVAL_MS,
  cctpDefaultFast: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getDefaultSettings(): BridgeSettings {
  return { ...DEFAULTS };
}

export function loadSettings(): BridgeSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<BridgeSettings>;
    return {
      platformFeeBps: clamp(
        Number(parsed.platformFeeBps ?? DEFAULTS.platformFeeBps),
        0,
        1000
      ),
      slippageBps: clamp(
        Number(parsed.slippageBps ?? DEFAULTS.slippageBps),
        0,
        MAX_SLIPPAGE_BPS
      ),
      quoteRefreshIntervalMs: clamp(
        Number(parsed.quoteRefreshIntervalMs ?? DEFAULTS.quoteRefreshIntervalMs),
        5_000,
        120_000
      ),
      statusPollIntervalMs: clamp(
        Number(parsed.statusPollIntervalMs ?? DEFAULTS.statusPollIntervalMs),
        2_000,
        60_000
      ),
      historyStatusPollIntervalMs: clamp(
        Number(parsed.historyStatusPollIntervalMs ?? DEFAULTS.historyStatusPollIntervalMs),
        5_000,
        120_000
      ),
      cctpDefaultFast: Boolean(parsed.cctpDefaultFast ?? DEFAULTS.cctpDefaultFast),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: BridgeSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
