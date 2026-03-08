import type { BridgeProvider } from "@/services/types";

const STORAGE_KEY_PREFIX = "qorebridge_history_";

export interface BridgeHistoryEntry {
  id: string;
  createdAt: number;
  provider: BridgeProvider;
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  amount: string; // bigint as string (6 decimals)
  recipient: string;
  sourceTxHash: string;
  /** Persisted status; can be updated when we refetch from chain */
  status: "pending" | "done" | "failed";
  destinationTxHash?: string;
  failureMessage?: string;
  /** NEAR Intents: required for status polling */
  depositAddress?: string;
  depositMemo?: string;
}

function storageKey(address: string): string {
  return `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
}

export function getHistory(address: string): BridgeHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BridgeHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(address: string, entries: BridgeHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export function addHistoryEntry(
  address: string,
  entry: Omit<BridgeHistoryEntry, "id" | "createdAt" | "status">
): BridgeHistoryEntry {
  const full: BridgeHistoryEntry = {
    ...entry,
    id: `${entry.sourceTxHash}-${Date.now()}`,
    createdAt: Date.now(),
    status: "pending",
  };
  const list = getHistory(address);
  list.unshift(full);
  saveHistory(address, list);
  return full;
}

export function updateHistoryEntry(
  address: string,
  id: string,
  updates: Partial<Pick<BridgeHistoryEntry, "status" | "destinationTxHash" | "failureMessage">>
): void {
  const list = getHistory(address);
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...updates };
  saveHistory(address, list);
}

export function generateId(): string {
  return `bh_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
