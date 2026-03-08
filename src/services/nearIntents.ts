import { NEAR_INTENTS_QUOTE_URL } from "@/config/contracts";
import { CHAIN_CONFIG } from "@/config/chains";
import { PLATFORM_FEE_BPS, PROVIDER_NAMES, DEFAULT_SLIPPAGE_BPS } from "@/config/constants";
import { calculatePlatformFee } from "@/lib/fees";
import type {
  IBridgeAdapter,
  BridgeParams,
  BridgeQuote,
  TransactionStatus,
} from "./types";

// NEAR Intents supported chain identifiers mapping
const NEAR_CHAIN_IDS: Record<number, string> = {
  1: "eth",
  42161: "arbitrum",
  8453: "base",
  10: "optimism",
  137: "polygon",
  43114: "avalanche",
  56: "bsc",
  59144: "linea",
};

/**
 * 1Click API expects originAsset/destinationAsset to be assetId from GET /v0/tokens
 * (e.g. nep141:eth-0x...omft.near). Map "chainId:SYMBOL" -> assetId.
 */
const NEAR_INTENTS_ASSET_IDS: Record<string, string> = {
  "1:USDC": "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
  "1:USDT": "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near",
  "42161:USDC": "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  "42161:USDT": "nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near",
  "8453:USDC": "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  "10:USDC": "nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ",
  "10:USDT": "nep245:v2_1.omni.hot.tg:10_359RPSJVdTxwTJT9TyGssr2rFoWo",
  "137:USDC": "nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L",
  "137:USDT": "nep245:v2_1.omni.hot.tg:137_3hpYoaLtt8MP1Z2GH1U473DMRKgr",
  "43114:USDC": "nep245:v2_1.omni.hot.tg:43114_3atVJH3r5c4GqiSYmg9fECvjc47o",
  "43114:USDT": "nep245:v2_1.omni.hot.tg:43114_372BeH7ENZieCaabwkbWkBiTTgXp",
  "56:USDC": "nep245:v2_1.omni.hot.tg:56_2w93GqMcEmQFDru84j3HZZWt557r",
  "56:USDT": "nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g",
};

function get1ClickAssetId(chainId: number, symbol: string): string | undefined {
  const key = `${chainId}:${symbol}`;
  return NEAR_INTENTS_ASSET_IDS[key] ?? (symbol === "USDT0" ? NEAR_INTENTS_ASSET_IDS[`${chainId}:USDT`] : undefined);
}

/** 1Click quote API request body (camelCase, required fields) */
interface NearIntentsQuoteRequest {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT" | "ANY_INPUT";
  slippageTolerance: number;
  originAsset: string;
  depositType: "ORIGIN_CHAIN" | "INTENTS";
  destinationAsset: string;
  refundTo: string;
  refundType: "ORIGIN_CHAIN" | "INTENTS";
  recipient: string;
  recipientType: "DESTINATION_CHAIN" | "INTENTS";
  deadline: string; // ISO 8601
  amount: string;
}

class NearIntentsAdapter implements IBridgeAdapter {
  name = "near-intents" as const;
  displayName = PROVIDER_NAMES["near-intents"];

  supportsRoute(
    fromChain: number,
    toChain: number,
    fromToken: string,
    toToken: string
  ): boolean {
    const validTokens = ["USDC", "USDT", "USDT0"];
    if (!validTokens.includes(fromToken) || !validTokens.includes(toToken))
      return false;
    return (
      NEAR_CHAIN_IDS[fromChain] !== undefined &&
      NEAR_CHAIN_IDS[toChain] !== undefined &&
      fromChain !== toChain
    );
  }

  async getQuote(params: BridgeParams): Promise<BridgeQuote | null> {
    if (
      !this.supportsRoute(
        params.fromChain,
        params.toChain,
        params.fromToken,
        params.toToken
      )
    ) {
      return null;
    }

    try {
      // 1Click API expects originAsset/destinationAsset to be assetId from their tokens list (e.g. nep141:eth-0x...omft.near)
      const originAsset = get1ClickAssetId(params.fromChain, params.fromToken);
      const destinationAsset = get1ClickAssetId(params.toChain, params.toToken);
      if (!originAsset || !destinationAsset) {
        // Chain/token not in 1Click tokens (e.g. Linea) – use fallback quote
        return this.getFallbackQuote(params);
      }

      const recipient = params.recipient || "0x0000000000000000000000000000000000000001";
      const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now

      const body: NearIntentsQuoteRequest = {
        dry: true,
        swapType: "EXACT_INPUT",
        slippageTolerance: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
        originAsset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset,
        refundTo: recipient,
        refundType: "ORIGIN_CHAIN",
        recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline,
        amount: params.amount.toString(),
      };

      const response = await fetch(NEAR_INTENTS_QUOTE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        const outputAmount = BigInt(data.output_amount || "0");
        const platformFeeBps = params.platformFeeBps ?? PLATFORM_FEE_BPS;
        const platformFee = calculatePlatformFee(params.amount, platformFeeBps);
        const bridgeFee = params.amount - outputAmount - platformFee;

        const fromChainName = CHAIN_CONFIG[params.fromChain]?.name || "";
        const toChainName = CHAIN_CONFIG[params.toChain]?.name || "";

        return {
          provider: "near-intents",
          providerName: this.displayName,
          inputAmount: params.amount,
          outputAmount: outputAmount - platformFee,
          estimatedTime: 30,
          gasFee: 0n,
          bridgeFee: bridgeFee > 0n ? bridgeFee : 0n,
          platformFee,
          route: `${params.fromToken} on ${fromChainName} → ${params.toToken} on ${toChainName} via NEAR Intents`,
        };
      }
    } catch {
      // API error – use fallback
    }

    return this.getFallbackQuote(params);
  }

  private getFallbackQuote(params: BridgeParams): BridgeQuote {
    const platformFeeBps = params.platformFeeBps ?? PLATFORM_FEE_BPS;
    const platformFee = calculatePlatformFee(params.amount, platformFeeBps);
    const solverSpread = (params.amount * 2n) / 10000n;
    const outputAmount = params.amount - platformFee - solverSpread;
    const fromChainName =
      CHAIN_CONFIG[params.fromChain]?.name || `Chain ${params.fromChain}`;
    const toChainName =
      CHAIN_CONFIG[params.toChain]?.name || `Chain ${params.toChain}`;
    return {
      provider: "near-intents",
      providerName: this.displayName,
      inputAmount: params.amount,
      outputAmount,
      estimatedTime: 30,
      gasFee: 0n,
      bridgeFee: solverSpread,
      platformFee,
      route: `${params.fromToken} on ${fromChainName} → ${params.toToken} on ${toChainName} via NEAR Intents`,
    };
  }

  getApprovalAddress(_fromChain: number): `0x${string}` | undefined {
    // NEAR Intents uses its own deposit contracts per chain
    // These would need to be fetched from the 1Click API
    return undefined;
  }

  async getStatus(
    txHash: string,
    _fromChain: number,
    _toChain: number
  ): Promise<TransactionStatus> {
    // NEAR Intents status would be tracked via the intent ID
    // For now, return a basic status
    return {
      state: "confirming",
      sourceTxHash: txHash,
      message: "Intent submitted, solvers competing to fulfill...",
    };
  }
}

export const nearIntentsAdapter = new NearIntentsAdapter();
