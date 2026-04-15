import {
  mainnet,
  arbitrum,
  base,
  optimism,
  polygon,
  avalanche,
  bsc,
  linea,
} from "wagmi/chains";

/** Tron mainnet (non-EVM); used for NEAR Intents only. Not in wagmi. */
export const TRON_CHAIN_ID = 195;

/** Solana mainnet (non-EVM); used for NEAR Intents only. Not in wagmi. */
export const SOLANA_CHAIN_ID = 501;

export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  icon: string;
  nativeToken: string;
  explorer: string;
  color: string;
}

export const SUPPORTED_CHAINS = [
  mainnet,
  arbitrum,
  base,
  optimism,
  polygon,
  avalanche,
  bsc,
  linea,
] as const;

// CoinGecko CDN (small size for 24–32px display)
const CG = "https://coin-images.coingecko.com/coins/images";

export const CHAIN_CONFIG: Record<number, ChainConfig> = {
  [mainnet.id]: {
    id: mainnet.id,
    name: "Ethereum",
    shortName: "ETH",
    icon: `${CG}/279/small/ethereum.png`,
    nativeToken: "ETH",
    explorer: "https://etherscan.io",
    color: "#627EEA",
  },
  [arbitrum.id]: {
    id: arbitrum.id,
    name: "Arbitrum",
    shortName: "ARB",
    icon: `${CG}/16547/small/photo_2023-03-29_21.47.00.jpeg`,
    nativeToken: "ETH",
    explorer: "https://arbiscan.io",
    color: "#28A0F0",
  },
  [base.id]: {
    id: base.id,
    name: "Base",
    shortName: "BASE",
    icon: `${CG}/279/small/ethereum.png`,
    nativeToken: "ETH",
    explorer: "https://basescan.org",
    color: "#0052FF",
  },
  [optimism.id]: {
    id: optimism.id,
    name: "Optimism",
    shortName: "OP",
    icon: `${CG}/25244/small/Optimism.png`,
    nativeToken: "ETH",
    explorer: "https://optimistic.etherscan.io",
    color: "#FF0420",
  },
  [polygon.id]: {
    id: polygon.id,
    name: "Polygon",
    shortName: "MATIC",
    icon: `${CG}/4713/small/matic-token-icon.png`,
    nativeToken: "POL",
    explorer: "https://polygonscan.com",
    color: "#8247E5",
  },
  [avalanche.id]: {
    id: avalanche.id,
    name: "Avalanche",
    shortName: "AVAX",
    icon: `${CG}/12559/small/Avalanche_Circle_RedWhite_Trans.png`,
    nativeToken: "AVAX",
    explorer: "https://snowtrace.io",
    color: "#E84142",
  },
  [bsc.id]: {
    id: bsc.id,
    name: "BNB Chain",
    shortName: "BSC",
    icon: `${CG}/825/small/bnb-icon2_2x.png`,
    nativeToken: "BNB",
    explorer: "https://bscscan.com",
    color: "#F0B90B",
  },
  [linea.id]: {
    id: linea.id,
    name: "Linea",
    shortName: "LINEA",
    icon: `${CG}/279/small/ethereum.png`,
    nativeToken: "ETH",
    explorer: "https://lineascan.build",
    color: "#121212",
  },
  [TRON_CHAIN_ID]: {
    id: TRON_CHAIN_ID,
    name: "Tron",
    shortName: "TRX",
    icon: `${CG}/1094/small/tron-logo.png`,
    nativeToken: "TRX",
    explorer: "https://tronscan.org",
    color: "#FF0013",
  },
  [SOLANA_CHAIN_ID]: {
    id: SOLANA_CHAIN_ID,
    name: "Solana",
    shortName: "SOL",
    icon: `${CG}/4128/small/solana.png`,
    nativeToken: "SOL",
    explorer: "https://solscan.io",
    color: "#9945FF",
  },
};

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIG[chainId];
}

export function getSupportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIG).map(Number);
}
