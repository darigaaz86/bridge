import { mainnet, arbitrum, base, optimism, polygon, avalanche } from "wagmi/chains";

// ============================================================
// CCTP V2 Contract Addresses
// https://developers.circle.com/cctp/docs/contract-addresses
// ============================================================

export const CCTP_TOKEN_MESSENGER_V2: Record<number, `0x${string}`> = {
  [mainnet.id]: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  [arbitrum.id]: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  [base.id]: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  [optimism.id]: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  [polygon.id]: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  [avalanche.id]: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
};

export const CCTP_MESSAGE_TRANSMITTER_V2: Record<number, `0x${string}`> = {
  [mainnet.id]: "0xC1b15d3B262bEeC0e3565C11C9e0F6545dF032eF",
  [arbitrum.id]: "0xC1b15d3B262bEeC0e3565C11C9e0F6545dF032eF",
  [base.id]: "0xC1b15d3B262bEeC0e3565C11C9e0F6545dF032eF",
  [optimism.id]: "0xC1b15d3B262bEeC0e3565C11C9e0F6545dF032eF",
  [polygon.id]: "0xC1b15d3B262bEeC0e3565C11C9e0F6545dF032eF",
  [avalanche.id]: "0xC1b15d3B262bEeC0e3565C11C9e0F6545dF032eF",
};

// CCTP Destination Domain IDs
export const CCTP_DOMAIN_IDS: Record<number, number> = {
  [mainnet.id]: 0,
  [avalanche.id]: 1,
  [optimism.id]: 2,
  [arbitrum.id]: 3,
  [base.id]: 6,
  [polygon.id]: 7,
};

// ============================================================
// USDT0 / LayerZero OFT Contract Addresses
// ============================================================

export const USDT0_OFT_CONTRACTS: Record<number, `0x${string}`> = {
  [mainnet.id]: "0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee", // OFT Adapter (lock/unlock)
  [arbitrum.id]: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  [base.id]: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  [optimism.id]: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
};

// LayerZero Endpoint V2 addresses (same across EVM chains)
export const LZ_ENDPOINT_V2: Record<number, `0x${string}`> = {
  [mainnet.id]: "0x1a44076050125825900e736c501f859c50fE728c",
  [arbitrum.id]: "0x1a44076050125825900e736c501f859c50fE728c",
  [base.id]: "0x1a44076050125825900e736c501f859c50fE728c",
  [optimism.id]: "0x1a44076050125825900e736c501f859c50fE728c",
  [polygon.id]: "0x1a44076050125825900e736c501f859c50fE728c",
  [avalanche.id]: "0x1a44076050125825900e736c501f859c50fE728c",
};

// LayerZero Endpoint IDs (chain identifiers in LZ system)
export const LZ_ENDPOINT_IDS: Record<number, number> = {
  [mainnet.id]: 30101,
  [arbitrum.id]: 30110,
  [base.id]: 30184,
  [optimism.id]: 30111,
  [polygon.id]: 30109,
  [avalanche.id]: 30106,
};

// ============================================================
// NEAR Intents / 1Click API
// ============================================================

export const NEAR_INTENTS_API = "https://1click.chaindefuser.com/v0";
export const NEAR_INTENTS_QUOTE_URL = `${NEAR_INTENTS_API}/quote`;
export const NEAR_INTENTS_TOKENS_URL = `${NEAR_INTENTS_API}/tokens`;
export const NEAR_INTENTS_STATUS_URL = `${NEAR_INTENTS_API}/status`;
export const NEAR_INTENTS_DEPOSIT_SUBMIT_URL = `${NEAR_INTENTS_API}/deposit/submit`;

// ============================================================
// CCTP Forwarding Service (destination mint paid from fee)
// ============================================================
// Hook data for Circle Forwarding Service: magic "cctp-forward" + version 0 + length 0
// When used with depositForBurnWithHook + sufficient maxFee, Circle relays the mint on destination.
export const CCTP_FORWARDING_SERVICE_HOOK_DATA =
  "0x636374702d666f72776172640000000000000000000000000000000000000000" as `0x${string}`;

// ============================================================
// External APIs
// ============================================================

export const CCTP_IRIS_API = "https://iris-api.circle.com/v2";
// LayerZero Scan API (official docs: scan.layerzero-api.com; old api-mainnet.layerzero-scan.com may return 403)
export const LZ_SCAN_API = "https://scan.layerzero-api.com/v1";

// ============================================================
// Aggregator Contract Addresses (per chain)
// TODO: Update with actual deployed addresses after deployment
// ============================================================

export const AGGREGATOR_CONTRACTS: Record<number, `0x${string}`> = {
  [mainnet.id]: "0x0000000000000000000000000000000000000000",
  [arbitrum.id]: "0x0000000000000000000000000000000000000000",
  [base.id]: "0xb63d7256E75bf9c7d0f1828137F557428e594dfC",
  [optimism.id]: "0x0000000000000000000000000000000000000000",
  [polygon.id]: "0x0000000000000000000000000000000000000000",
  [avalanche.id]: "0x0000000000000000000000000000000000000000",
};

// ============================================================
// Provider IDs (keccak256 hashes of provider name strings)
// These must match the provider IDs registered in the on-chain
// Aggregator Contract provider registry.
// ============================================================

export const PROVIDER_IDS = {
  cctp: "0xf8455f3379434a3ef6559858314c8f61d36412da9937cd3f1de59562deb078e6" as `0x${string}`,
  usdt0: "0x6c586b6e10c133cf1ef94fbd023b9480e32c2e41bbd6948212bbf2507d82eba1" as `0x${string}`,
  "near-intents": "0x3e9fe409e747e9f7a1970485668abf89b634f38b94401f01f39ee3e70e882039" as `0x${string}`,
  across: "0x72586f379621e0a09286464fa4f6cfa1a201b0834aa94eb8f17feece751f0bd7" as `0x${string}`,
} as const;

// ============================================================
// Indexer Service API
// ============================================================

export const INDEXER_API_URL =
  process.env.NEXT_PUBLIC_INDEXER_API_URL || "https://indexer.qorebridge.com";
