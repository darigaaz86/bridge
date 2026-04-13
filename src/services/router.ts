import { cctpAdapter } from "./cctp";
import { usdt0Adapter } from "./usdt0";
import { nearIntentsAdapter } from "./nearIntents";
import { acrossAdapter } from "./across";
import type { IBridgeAdapter, BridgeParams, BridgeQuote } from "./types";

// All registered bridge adapters
const adapters: IBridgeAdapter[] = [cctpAdapter, usdt0Adapter, nearIntentsAdapter, acrossAdapter];

/**
 * Get all quotes from supported adapters for a given route.
 * Queries all adapters in parallel and returns sorted results.
 */
export async function getQuotes(params: BridgeParams): Promise<BridgeQuote[]> {
  // Filter to adapters that support this route
  const supportedAdapters = adapters.filter((adapter) =>
    adapter.supportsRoute(params.fromChain, params.toChain, params.fromToken, params.toToken)
  );

  if (supportedAdapters.length === 0) {
    return [];
  }

  // Query all adapters in parallel
  const quotePromises = supportedAdapters.map(async (adapter) => {
    try {
      return await adapter.getQuote(params);
    } catch (error) {
      console.error(`Error getting quote from ${adapter.name}:`, error);
      return null;
    }
  });

  const results = await Promise.allSettled(quotePromises);

  // Collect successful quotes only from adapters that support this route
  const quotes: BridgeQuote[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const adapter = supportedAdapters[i];
    if (
      result.status === "fulfilled" &&
      result.value !== null &&
      adapter.supportsRoute(
        params.fromChain,
        params.toChain,
        params.fromToken,
        params.toToken
      )
    ) {
      quotes.push(result.value);
    }
  }

  // Sort by total fee (lowest first = best value), then by estimated time (fastest first)
  quotes.sort((a, b) => {
    const totalFeeA = a.inputAmount - a.outputAmount;
    const totalFeeB = b.inputAmount - b.outputAmount;
    const feeDiff = Number(totalFeeA - totalFeeB);
    if (feeDiff !== 0) return feeDiff;
    return a.estimatedTime - b.estimatedTime;
  });

  return quotes;
}

/**
 * Get the best quote for a given route.
 */
export async function getBestQuote(params: BridgeParams): Promise<BridgeQuote | null> {
  const quotes = await getQuotes(params);
  return quotes[0] || null;
}

/**
 * Get the adapter instance by provider name.
 */
export function getAdapter(provider: string): IBridgeAdapter | undefined {
  return adapters.find((a) => a.name === provider);
}

/**
 * Check if any adapter supports the given route.
 */
export function isRouteSupported(
  fromChain: number,
  toChain: number,
  fromToken: string,
  toToken: string
): boolean {
  return adapters.some((adapter) =>
    adapter.supportsRoute(fromChain, toChain, fromToken, toToken)
  );
}
