import { mainnet, arbitrum, base, optimism, polygon, avalanche, bsc, linea } from "wagmi/chains";
import { TRON_CHAIN_ID, SOLANA_CHAIN_ID } from "./chains";

// CoinGecko CDN (small size for token logos)
const CG = "https://coin-images.coingecko.com/coins/images";

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  /** EVM: 0x... ; Tron: base58 */
  addresses: Record<number, string>;
}

/** Alias for TokenConfig used by the dynamic token discovery API surface. */
export type TokenInfo = TokenConfig;

export const TOKENS: Record<string, TokenConfig> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    icon: `${CG}/6319/small/usdc.png`,
    addresses: {
      [mainnet.id]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      [arbitrum.id]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      [optimism.id]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      [polygon.id]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      [avalanche.id]: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      [bsc.id]: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      [linea.id]: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
      [SOLANA_CHAIN_ID]: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    },
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    icon: `${CG}/325/small/tether.png`,
    addresses: {
      [mainnet.id]: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      [arbitrum.id]: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      [base.id]: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      [optimism.id]: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      [polygon.id]: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      [avalanche.id]: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      [bsc.id]: "0x55d398326f99059fF775485246999027B3197955",
      [linea.id]: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
      [TRON_CHAIN_ID]: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // TRC20 USDT
      [SOLANA_CHAIN_ID]: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // SPL USDT
    },
  },
  USDT0: {
    symbol: "USDT0",
    name: "USDT0 (Omnichain)",
    decimals: 6,
    icon: `${CG}/325/small/tether.png`,
    addresses: {
      [mainnet.id]: "0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee", // OFT Adapter
      [arbitrum.id]: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      [base.id]: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      [optimism.id]: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      [bsc.id]: "0x55d398326f99059fF775485246999027B3197955",
    },
  },
};

export function getTokenAddress(
  symbol: string,
  chainId: number
): string | undefined {
  return TOKENS[symbol]?.addresses[chainId];
}

/** True for Tron (non-EVM); use for TronLink and TronWeb flows. */
export function isTronChain(chainId: number): boolean {
  return chainId === TRON_CHAIN_ID;
}

/** True for Solana (non-EVM); use for Solana wallet adapter flows. */
export function isSolanaChain(chainId: number): boolean {
  return chainId === SOLANA_CHAIN_ID;
}

/** Return token address as EVM 0x or undefined if not EVM. */
export function getTokenAddressEVM(
  symbol: string,
  chainId: number
): `0x${string}` | undefined {
  const addr = getTokenAddress(symbol, chainId);
  if (!addr || isTronChain(chainId) || isSolanaChain(chainId) || !addr.startsWith("0x")) return undefined;
  return addr as `0x${string}`;
}

export function getTokensForChain(chainId: number): TokenConfig[] {
  return Object.values(TOKENS).filter(
    (token) => token.addresses[chainId] !== undefined
  );
}

export function getTokenBySymbol(symbol: string): TokenConfig | undefined {
  return TOKENS[symbol];
}

// ---------------------------------------------------------------------------
// Dynamic Token Registry Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  tokens: TokenInfo[];
  timestamp: number;
}

const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const tokenCache = new Map<number, CacheEntry>();

/**
 * Merge hardcoded EVM addresses into dynamically discovered tokens.
 *
 * For each dynamic token, if a hardcoded token with the same symbol exists,
 * the hardcoded addresses fill gaps (dynamic addresses take precedence).
 */
function mergeHardcodedAddresses(dynamicTokens: TokenInfo[]): TokenInfo[] {
  return dynamicTokens.map((token) => {
    const hardcoded = TOKENS[token.symbol] ?? TOKENS[token.symbol.toUpperCase()];
    if (!hardcoded) return token;

    // Union of addresses: dynamic takes precedence, hardcoded fills gaps
    const mergedAddresses: Record<number, string> = { ...hardcoded.addresses, ...token.addresses };
    return { ...token, addresses: mergedAddresses };
  });
}

/**
 * Async token fetcher with in-memory cache.
 *
 * 1. Returns cached tokens if the entry is younger than 5 minutes.
 * 2. On cache miss, dynamically imports `getAllSupportedTokens` from the
 *    router (dynamic import avoids circular dependency) and fetches tokens.
 * 3. Merges hardcoded EVM addresses into the dynamic results.
 * 4. Falls back to `getTokensForChain(chainId)` if the merged result is empty.
 */
export async function getTokensForChainAsync(chainId: number): Promise<TokenInfo[]> {
  const now = Date.now();
  const cached = tokenCache.get(chainId);

  if (cached && now - cached.timestamp < TOKEN_CACHE_TTL) {
    return cached.tokens;
  }

  try {
    // Dynamic import to break circular dependency (router.ts imports from tokens.ts)
    const { getAllSupportedTokens } = await import("@/services/router");
    const dynamicTokens = await getAllSupportedTokens(chainId);
    const merged = mergeHardcodedAddresses(dynamicTokens);

    if (merged.length === 0) {
      const fallback = getTokensForChain(chainId);
      tokenCache.set(chainId, { tokens: fallback, timestamp: now });
      return fallback;
    }

    tokenCache.set(chainId, { tokens: merged, timestamp: now });
    return merged;
  } catch {
    // On any failure, return hardcoded fallback and cache it
    const fallback = getTokensForChain(chainId);
    tokenCache.set(chainId, { tokens: fallback, timestamp: now });
    return fallback;
  }
}
