import { formatUnits, parseUnits, pad, type Address } from "viem";

export function formatAmount(
  amount: bigint,
  decimals: number,
  displayDecimals: number = 4
): string {
  const formatted = formatUnits(amount, decimals);
  const parts = formatted.split(".");
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[1].slice(0, displayDecimals)}`;
}

export function parseAmount(amount: string, decimals: number): bigint {
  try {
    return parseUnits(amount, decimals);
  } catch {
    return 0n;
  }
}

export function shortenAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function addressToBytes32(address: Address): `0x${string}` {
  return pad(address, { size: 32 });
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `~${minutes}m`;
  return `~${minutes}m ${secs}s`;
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
