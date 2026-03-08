import { mainnet, arbitrum, base, optimism, polygon, avalanche, bsc, linea } from "wagmi/chains";

// CoinGecko CDN (small size for token logos)
const CG = "https://coin-images.coingecko.com/coins/images";

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  addresses: Record<number, `0x${string}`>;
}

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
): `0x${string}` | undefined {
  return TOKENS[symbol]?.addresses[chainId];
}

export function getTokensForChain(chainId: number): TokenConfig[] {
  return Object.values(TOKENS).filter(
    (token) => token.addresses[chainId] !== undefined
  );
}

export function getTokenBySymbol(symbol: string): TokenConfig | undefined {
  return TOKENS[symbol];
}
