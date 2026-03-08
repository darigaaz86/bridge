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

export const CHAIN_CONFIG: Record<number, ChainConfig> = {
  [mainnet.id]: {
    id: mainnet.id,
    name: "Ethereum",
    shortName: "ETH",
    icon: "/chains/ethereum.svg",
    nativeToken: "ETH",
    explorer: "https://etherscan.io",
    color: "#627EEA",
  },
  [arbitrum.id]: {
    id: arbitrum.id,
    name: "Arbitrum",
    shortName: "ARB",
    icon: "/chains/arbitrum.svg",
    nativeToken: "ETH",
    explorer: "https://arbiscan.io",
    color: "#28A0F0",
  },
  [base.id]: {
    id: base.id,
    name: "Base",
    shortName: "BASE",
    icon: "/chains/base.svg",
    nativeToken: "ETH",
    explorer: "https://basescan.org",
    color: "#0052FF",
  },
  [optimism.id]: {
    id: optimism.id,
    name: "Optimism",
    shortName: "OP",
    icon: "/chains/optimism.svg",
    nativeToken: "ETH",
    explorer: "https://optimistic.etherscan.io",
    color: "#FF0420",
  },
  [polygon.id]: {
    id: polygon.id,
    name: "Polygon",
    shortName: "MATIC",
    icon: "/chains/polygon.svg",
    nativeToken: "POL",
    explorer: "https://polygonscan.com",
    color: "#8247E5",
  },
  [avalanche.id]: {
    id: avalanche.id,
    name: "Avalanche",
    shortName: "AVAX",
    icon: "/chains/avalanche.svg",
    nativeToken: "AVAX",
    explorer: "https://snowtrace.io",
    color: "#E84142",
  },
  [bsc.id]: {
    id: bsc.id,
    name: "BNB Chain",
    shortName: "BSC",
    icon: "/chains/bsc.svg",
    nativeToken: "BNB",
    explorer: "https://bscscan.com",
    color: "#F0B90B",
  },
  [linea.id]: {
    id: linea.id,
    name: "Linea",
    shortName: "LINEA",
    icon: "/chains/linea.svg",
    nativeToken: "ETH",
    explorer: "https://lineascan.build",
    color: "#121212",
  },
};

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIG[chainId];
}

export function getSupportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIG).map(Number);
}
