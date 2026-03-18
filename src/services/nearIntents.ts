import {
  NEAR_INTENTS_QUOTE_URL,
  NEAR_INTENTS_STATUS_URL,
  NEAR_INTENTS_DEPOSIT_SUBMIT_URL,
  AGGREGATOR_CONTRACTS,
} from "@/config/contracts";
import { CHAIN_CONFIG, TRON_CHAIN_ID } from "@/config/chains";
import { PLATFORM_FEE_BPS, PROVIDER_NAMES, DEFAULT_SLIPPAGE_BPS, APP_FEE_RECIPIENT } from "@/config/constants";
import type {
  IBridgeAdapter,
  BridgeParams,
  BridgeQuote,
  TransactionStatus,
} from "./types";

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
  // Tron (chainId 195) – 1Click assetId for TRC20 USDT
  "195:USDT": "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near",
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
  appFees?: Array<{ recipient: string; fee: number }>;
}

const TAG = "[NEAR Intents]";

class NearIntentsAdapter implements IBridgeAdapter {
  name = "near-intents" as const;
  displayName = PROVIDER_NAMES["near-intents"];

  /** Build appFees array if a recipient is configured */
  private buildAppFees(feeBps?: number): Array<{ recipient: string; fee: number }> | undefined {
    const bps = feeBps ?? PLATFORM_FEE_BPS;
    if (!APP_FEE_RECIPIENT || bps <= 0) return undefined;
    return [{ recipient: APP_FEE_RECIPIENT, fee: bps }];
  }

  supportsRoute(
    fromChain: number,
    toChain: number,
    fromToken: string,
    toToken: string
  ): boolean {
    if (fromChain === toChain) return false;
    const originAsset = get1ClickAssetId(fromChain, fromToken);
    const destinationAsset = get1ClickAssetId(toChain, toToken);
    return originAsset != null && destinationAsset != null;
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
        // Chain/token not in 1Click tokens – do not show this route
        return null;
      }

      // 1Click expects recipient = destination chain, refundTo = origin chain (refund goes back to sender)
      const recipient =
        params.recipient ||
        (params.toChain === TRON_CHAIN_ID
          ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
          : "0x0000000000000000000000000000000000000001");
      const refundTo =
        params.refundTo ||
        (params.fromChain === TRON_CHAIN_ID
          ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
          : "0x0000000000000000000000000000000000000001");
      const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now

      const body: NearIntentsQuoteRequest = {
        dry: true,
        swapType: "EXACT_INPUT",
        slippageTolerance: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
        originAsset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset,
        refundTo,
        refundType: "ORIGIN_CHAIN",
        recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline,
        amount: params.amount.toString(),
        appFees: this.buildAppFees(params.platformFeeBps),
      };

      console.log(TAG, "getQuote request", JSON.stringify(body));

      const response = await fetch(NEAR_INTENTS_QUOTE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn(TAG, "getQuote failed", response.status, data?.message ?? data?.error ?? data);
        return null;
      }

      console.log(TAG, "getQuote response", JSON.stringify(data));

      const rawOut = data.quote?.amountOut ?? data.output_amount ?? data.amountOut;
      if (rawOut == null || rawOut === "") return null;
      const outputAmount = BigInt(rawOut);
      const platformFeeBps = params.platformFeeBps ?? PLATFORM_FEE_BPS;
      // When appFees is sent, the API deducts the fee from input before swapping.
      // Calculate what was taken so we can display it, but don't subtract again from output.
      const platformFee = APP_FEE_RECIPIENT && platformFeeBps > 0
        ? (params.amount * BigInt(platformFeeBps)) / 10000n
        : 0n;
      const bridgeFee = params.amount - outputAmount - platformFee;

      console.log(TAG, "getQuote fees", {
        inputAmount: params.amount.toString(),
        outputAmount: outputAmount.toString(),
        platformFeeBps,
        platformFee: platformFee.toString(),
        bridgeFee: (bridgeFee > 0n ? bridgeFee : 0n).toString(),
        appFeeRecipient: APP_FEE_RECIPIENT || "(none)",
      });

      const fromChainName = CHAIN_CONFIG[params.fromChain]?.name || "";
      const toChainName = CHAIN_CONFIG[params.toChain]?.name || "";

      return {
        provider: "near-intents",
        providerName: this.displayName,
        inputAmount: params.amount,
        outputAmount,
        estimatedTime: 30,
        gasFee: 0n,
        bridgeFee: bridgeFee > 0n ? bridgeFee : 0n,
        platformFee,
        route: `${params.fromToken} on ${fromChainName} → ${params.toToken} on ${toChainName} via NEAR Intents`,
      };
    } catch {
      return null;
    }
  }

  getApprovalAddress(fromChain: number): `0x${string}` | undefined {
    return AGGREGATOR_CONTRACTS[fromChain];
  }

  /**
   * Get a live quote with deposit address (dry: false). Call only when user is about to send.
   * @throws Error with API message when request fails or response lacks deposit address
   */
  async getExecutionQuote(params: BridgeParams): Promise<{
    depositAddress: string;
    depositMemo?: string;
    amountIn: bigint;
  }> {
    if (
      !this.supportsRoute(
        params.fromChain,
        params.toChain,
        params.fromToken,
        params.toToken
      )
    ) {
      throw new Error("This route is not supported by NEAR Intents.");
    }

    const originAsset = get1ClickAssetId(params.fromChain, params.fromToken);
    const destinationAsset = get1ClickAssetId(params.toChain, params.toToken);
    if (!originAsset || !destinationAsset) {
      throw new Error(
        "NEAR Intents does not support this chain or token pair. Try another route."
      );
    }

    const recipient =
      params.recipient ||
      (params.toChain === TRON_CHAIN_ID
        ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
        : "0x0000000000000000000000000000000000000001");
    const refundTo =
      params.refundTo ||
      (params.fromChain === TRON_CHAIN_ID
        ? "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
        : "0x0000000000000000000000000000000000000001");
    const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const body = {
      dry: false,
      swapType: "EXACT_INPUT" as const,
      slippageTolerance: params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
      originAsset,
      depositType: "ORIGIN_CHAIN" as const,
      destinationAsset,
      refundTo,
      refundType: "ORIGIN_CHAIN" as const,
      recipient,
      recipientType: "DESTINATION_CHAIN" as const,
      deadline,
      amount: params.amount.toString(),
      appFees: this.buildAppFees(params.platformFeeBps),
      // Optional: help the relay associate the quote with the connected wallet
      ...(params.recipient && { connectedWallets: [params.recipient] }),
    };

    console.log(TAG, "getExecutionQuote request", JSON.stringify(body));

    const response = await fetch(NEAR_INTENTS_QUOTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg =
        typeof data?.message === "string"
          ? data.message
          : data?.error ?? `Request failed (${response.status})`;
      console.error(TAG, "getExecutionQuote failed", response.status, msg);
      throw new Error(`NEAR Intents: ${msg}`);
    }

    console.log(TAG, "getExecutionQuote response", JSON.stringify(data));

    const quote = data.quote;
    if (!quote?.depositAddress) {
      throw new Error(
        "NEAR Intents did not return a deposit address. The service may be busy; try again in a moment."
      );
    }

    const amountIn = BigInt(quote.amountIn ?? params.amount.toString());
    return {
      depositAddress: quote.depositAddress,
      depositMemo: quote.depositMemo,
      amountIn,
    };
  }

  async submitDepositTx(
    txHash: string,
    depositAddress: string,
    depositMemo?: string
  ): Promise<void> {
    const body: Record<string, string> = {
      txHash,
      depositAddress,
    };
    if (depositMemo) body.memo = depositMemo;
    console.log(TAG, "submitDepositTx", JSON.stringify(body));
    const res = await fetch(NEAR_INTENTS_DEPOSIT_SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(TAG, "submitDepositTx status", res.status);
  }

  async getStatus(
    txHash: string,
    _fromChain: number,
    _toChain: number,
    options?: { depositAddress?: string; depositMemo?: string }
  ): Promise<TransactionStatus> {
    if (!options?.depositAddress) {
      return {
        state: "confirming",
        sourceTxHash: txHash,
        message: "Deposit submitted; use deposit address to check status.",
      };
    }

    const params = new URLSearchParams({
      depositAddress: options.depositAddress,
    });
    if (options.depositMemo) params.set("depositMemo", options.depositMemo);
    const url = `${NEAR_INTENTS_STATUS_URL}?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(TAG, "getStatus failed", response.status);
      return {
        state: "confirming",
        sourceTxHash: txHash,
        message: "Checking swap status...",
      };
    }

    const data = await response.json();
    const status = data.status as string;
    console.log(TAG, "getStatus", { depositAddress: options.depositAddress, status, swapDetails: data.swapDetails });
    const swapDetails = data.swapDetails;

    const destTx =
      swapDetails?.destinationChainTxHashes?.[0]?.hash ??
      swapDetails?.destinationChainTxHashes?.[0];

    if (status === "SUCCESS") {
      return {
        state: "done",
        sourceTxHash: txHash,
        destinationTxHash: typeof destTx === "string" ? destTx : destTx?.hash,
        message: "Swap completed.",
      };
    }
    if (status === "REFUNDED" || status === "FAILED" || status === "INCOMPLETE_DEPOSIT") {
      const reason =
        data.swapDetails?.refundReason || data.swapDetails?.refundedAmount != null
          ? "Refunded"
          : "Failed";
      return {
        state: "failed",
        sourceTxHash: txHash,
        message: reason,
      };
    }

    const messages: Record<string, string> = {
      PENDING_DEPOSIT: "Waiting for deposit...",
      KNOWN_DEPOSIT_TX: "Deposit detected, processing...",
      PROCESSING: "Solvers fulfilling your swap...",
    };
    return {
      state: "confirming",
      sourceTxHash: txHash,
      message: messages[status] ?? "Processing...",
    };
  }
}

export const nearIntentsAdapter = new NearIntentsAdapter();
