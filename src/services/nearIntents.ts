import {
  NEAR_INTENTS_QUOTE_URL,
  NEAR_INTENTS_STATUS_URL,
  NEAR_INTENTS_DEPOSIT_SUBMIT_URL,
  AGGREGATOR_CONTRACTS,
  PROVIDER_IDS,
} from "@/config/contracts";
import { CHAIN_CONFIG, TRON_CHAIN_ID } from "@/config/chains";
import { PROVIDER_NAMES, DEFAULT_SLIPPAGE_BPS } from "@/config/constants";
import { getTokenAddress, getTokenAddressEVM } from "@/config/tokens";
import { pad, encodeAbiParameters } from "viem";
import { AGGREGATOR_ABI } from "@/abi/aggregator";
import type {
  IBridgeAdapter,
  BridgeParams,
  BridgeQuote,
  TransactionStatus,
  ExecuteContext,
  ExecuteResult,
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
}

const TAG = "[NEAR Intents]";

class NearIntentsAdapter implements IBridgeAdapter {
  name = "near-intents" as const;
  displayName = PROVIDER_NAMES["near-intents"];

  supportsRoute(
    fromChain: number,
    toChain: number,
    fromToken: string,
    toToken: string
  ): boolean {
    if (fromChain === toChain && fromToken === toToken) return false;
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

      // On EVM chains, the aggregator deducts feeBps before forwarding to 1Click.
      // Quote with the post-fee amount so the displayed output matches reality.
      const hasAggregator = params.fromChain !== TRON_CHAIN_ID && !!AGGREGATOR_CONTRACTS[params.fromChain];
      const feeBps = params.platformFeeBps ?? 5;
      const platformFeeAmount = hasAggregator
        ? (params.amount * BigInt(feeBps)) / 10000n
        : 0n;
      const quoteAmount = params.amount - platformFeeAmount;

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
        amount: quoteAmount.toString(),
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
      // bridgeFee = what 1Click consumed as solver spread (quoteAmount in - output)
      const bridgeFee = quoteAmount - outputAmount;

      console.log(TAG, "getQuote fees", {
        inputAmount: params.amount.toString(),
        outputAmount: outputAmount.toString(),
        bridgeFee: (bridgeFee > 0n ? bridgeFee : 0n).toString(),
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
        platformFee: 0n,
        route: `${params.fromToken} on ${fromChainName} → ${params.toToken} on ${toChainName} via NEAR Intents`,
      };
    } catch {
      return null;
    }
  }

  getApprovalAddress(fromChain: number): `0x${string}` | undefined {
    return AGGREGATOR_CONTRACTS[fromChain];
  }

  needsApproval(fromChain: number): boolean {
    // Tron uses direct TRC20 transfer, no EVM approval needed
    return fromChain !== TRON_CHAIN_ID;
  }

  async execute(
    params: BridgeParams,
    _quote: BridgeQuote,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult> {
    if (params.fromChain === TRON_CHAIN_ID) {
      return this.executeTron(params, ctx);
    }
    return this.executeEvm(params, ctx);
  }

  private async executeTron(
    params: BridgeParams,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult> {
    if (!window.tronWeb?.contract) {
      throw new Error("TronLink not ready. Please refresh and connect TronLink.");
    }

    const execQuote = await this.getExecutionQuote({
      ...params,
      refundTo: ctx.tronAddress ?? undefined,
    });

    console.log(TAG, "Tron execQuote", {
      depositAddress: execQuote.depositAddress,
      depositMemo: execQuote.depositMemo,
      amountIn: execQuote.amountIn.toString(),
    });

    const trc20Address = getTokenAddress(params.fromToken, params.fromChain);
    if (!trc20Address) throw new Error("Unsupported token for Tron");

    const tw = window.tronWeb!;
    const amountStr = execQuote.amountIn.toString();
    const toAddr = execQuote.depositAddress;

    let txResult: { transaction?: string; txid?: string } | string | null = null;
    try {
      const factory = await Promise.resolve(tw.contract(
        [
          {
            name: "transfer",
            type: "function",
            inputs: [
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
            ],
            outputs: [{ name: "", type: "bool" }],
            stateMutability: "nonpayable",
          },
        ],
        trc20Address
      ));
      const instance = typeof (factory as { at?: (a: string) => unknown }).at === "function"
        ? (factory as { at: (a: string) => unknown }).at(trc20Address)
        : factory;
      const inst = instance as {
        transfer?: (to: string, amount: string) => { send: (o?: { from: string }) => Promise<unknown> };
        methods?: { transfer?: (to: string, amount: string) => { send: (o?: { from: string }) => Promise<unknown> } };
      };
      let sendable: { send?: (o?: { from: string }) => Promise<unknown> } | null = null;
      if (inst.transfer) {
        sendable = inst.transfer(toAddr, amountStr) as { send?: (o?: { from: string }) => Promise<unknown> };
      } else if (inst.methods?.transfer) {
        sendable = inst.methods.transfer(toAddr, amountStr) as { send?: (o?: { from: string }) => Promise<unknown> };
      }
      if (sendable && typeof sendable.send === "function") {
        const tx = await sendable.send({ from: ctx.tronAddress! });
        txResult = tx as { transaction?: string; txid?: string };
      }
    } catch {
      // Fallback: triggerSmartContract + sign + sendRawTransaction
    }

    if (!txResult && tw.transactionBuilder?.triggerSmartContract && tw.trx?.sign && tw.trx?.sendRawTransaction) {
      const functionSelector = "transfer(address,uint256)";
      const parameter = [
        { type: "address", value: toAddr },
        { type: "uint256", value: amountStr },
      ];
      const built = await tw.transactionBuilder.triggerSmartContract(
        trc20Address,
        functionSelector,
        {},
        parameter
      );
      if (built?.transaction) {
        const signed = await tw.trx.sign(built.transaction);
        const result = (await tw.trx.sendRawTransaction(signed)) as { txid?: string; transaction?: string | { txID?: string } };
        const txId = result?.txid ?? (typeof result?.transaction === "string" ? result.transaction : result?.transaction?.txID);
        if (txId) txResult = { txid: txId };
      }
    }

    const hash = typeof txResult === "string" ? txResult : (txResult?.txid ?? (txResult as { transaction?: string })?.transaction ?? "");
    if (!hash) throw new Error("Tron transaction failed");

    try {
      await this.submitDepositTx(hash, execQuote.depositAddress, execQuote.depositMemo);
    } catch {
      // Non-fatal
    }

    return {
      hash,
      meta: {
        depositAddress: execQuote.depositAddress,
        ...(execQuote.depositMemo && { depositMemo: execQuote.depositMemo }),
      },
    };
  }

  private async executeEvm(
    params: BridgeParams,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult> {
    const aggregator = AGGREGATOR_CONTRACTS[params.fromChain];
    if (!aggregator) {
      throw new Error("Aggregator not configured for this chain");
    }

    // Read on-chain fee so we can request a 1Click quote for the post-fee amount
    let onChainFeeBps = params.platformFeeBps ?? 5;
    if (ctx.publicClient) {
      try {
        const bps = await ctx.publicClient.readContract({
          address: aggregator,
          abi: AGGREGATOR_ABI,
          functionName: "feeBps",
        });
        onChainFeeBps = Number(bps);
      } catch {
        // use fallback
      }
    }
    const platformFeeAmount = (params.amount * BigInt(onChainFeeBps)) / 10000n;
    const netAmount = params.amount - platformFeeAmount;

    const execQuote = await this.getExecutionQuote({
      ...params,
      amount: netAmount,
      refundTo: ctx.evmAddress ?? undefined,
    });

    console.log(TAG, "EVM execQuote", {
      depositAddress: execQuote.depositAddress,
      depositMemo: execQuote.depositMemo,
      amountIn: execQuote.amountIn.toString(),
    });

    const tokenAddress = getTokenAddressEVM(params.fromToken, params.fromChain);
    if (!tokenAddress) throw new Error("Unsupported token for this chain");

    const recipientBytes32 = pad(params.recipient as `0x${string}`, { size: 32 });

    const providerData = encodeAbiParameters(
      [{ type: "address" }],
      [execQuote.depositAddress as `0x${string}`]
    );

    const hash = await ctx.writeContractAsync({
      address: aggregator,
      abi: AGGREGATOR_ABI,
      functionName: "bridge",
      args: [
        PROVIDER_IDS["near-intents"],
        tokenAddress,
        params.amount,
        BigInt(params.toChain),
        recipientBytes32,
        providerData,
      ],
      chainId: params.fromChain,
    });

    try {
      await this.submitDepositTx(hash, execQuote.depositAddress, execQuote.depositMemo);
    } catch {
      // Non-fatal
    }

    return {
      hash,
      meta: {
        depositAddress: execQuote.depositAddress,
        ...(execQuote.depositMemo && { depositMemo: execQuote.depositMemo }),
      },
    };
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
