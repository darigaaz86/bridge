import {
  CCTP_TOKEN_MESSENGER_V2,
  CCTP_DOMAIN_IDS,
  CCTP_IRIS_API,
  AGGREGATOR_CONTRACTS,
  CCTP_FORWARDING_SERVICE_HOOK_DATA,
  PROVIDER_IDS,
} from "@/config/contracts";
import { CHAIN_CONFIG } from "@/config/chains";
import { PROVIDER_NAMES } from "@/config/constants";
import { getTokenAddressEVM } from "@/config/tokens";
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

/** Fee tier from Circle fee API (forwardFee in 6-decimal USDC units) */
interface CctpFeeTier {
  low: number;
  med: number;
  high: number;
}

/** Single fee option from GET /v2/burn/USDC/fees/{source}/{dest}?forward=true */
interface CctpFeeOption {
  finalityThreshold: number;
  minimumFee: number; // basis points
  forwardFee: CctpFeeTier;
}

/** Result of CCTP fee lookup: maxFee (in 6-decimal USDC) and which tier. */
interface CctpFeeResult {
  maxFee: bigint;
  finalityThreshold: number;
  isFast: boolean;
  estimatedTimeSeconds: number;
}

/**
 * Fetch CCTP fees and compute maxFee for the chosen tier.
 * Fast Transfer: finalityThreshold 1000, protocol fee (0–14 bps) + forward fee, ~20–60s.
 * Standard Transfer: finalityThreshold 2000, forward fee only, ~15+ min.
 */
async function getCctpFees(
  sourceDomain: number,
  destDomain: number,
  outputAmount: bigint,
  preferFast: boolean
): Promise<CctpFeeResult | null> {
  try {
    const res = await fetch(
      `${CCTP_IRIS_API}/burn/USDC/fees/${sourceDomain}/${destDomain}?forward=true`,
      { headers: { "Content-Type": "application/json" } }
    );
    if (!res.ok) return null;
    const data: CctpFeeOption[] = await res.json();

    if (preferFast) {
      const option = data.find((o) => o.finalityThreshold <= 1000) ?? data[0];
      if (option?.forwardFee?.med == null) return null;
      const forwardFee = BigInt(Math.round(option.forwardFee.med));
      // minimumFee is in bps (e.g. 1.3 = 1.3 bps). Protocol fee = outputAmount * minimumFee / 10000
      const minimumFeeBps = option.minimumFee ?? 0;
      const protocolFee =
        (outputAmount * BigInt(Math.round(minimumFeeBps * 100))) / 1_000_000n;
      const maxFeeRaw = forwardFee + protocolFee;
      const maxFee = (maxFeeRaw * 110n) / 100n; // 10% buffer per Circle docs
    return {
      maxFee,
      finalityThreshold: 1000,
      isFast: true,
      estimatedTimeSeconds: 45, // ~20s Ethereum, ~8s L2s per Circle docs
    };
  }

  const option = data.find((o) => o.finalityThreshold >= 2000) ?? data[data.length - 1];
  if (option?.forwardFee?.med == null) return null;
  const maxFee = BigInt(Math.round(option.forwardFee.med));
  return {
    maxFee,
    finalityThreshold: 2000,
    isFast: false,
    estimatedTimeSeconds: 0, // adapter uses getEstimatedTime(fromChain)
  };
  } catch {
    return null;
  }
}

class CCTPAdapter implements IBridgeAdapter {
  name = "cctp" as const;
  displayName = PROVIDER_NAMES.cctp;

  supportsRoute(
    fromChain: number,
    toChain: number,
    fromToken: string,
    toToken: string
  ): boolean {
    // CCTP only supports USDC
    if (fromToken !== "USDC" || toToken !== "USDC") return false;
    // Both chains must have CCTP deployment
    return (
      CCTP_DOMAIN_IDS[fromChain] !== undefined &&
      CCTP_DOMAIN_IDS[toChain] !== undefined &&
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

    const sourceDomain = CCTP_DOMAIN_IDS[params.fromChain];
    const destDomain = CCTP_DOMAIN_IDS[params.toChain];
    if (sourceDomain === undefined || destDomain === undefined) return null;

    const outputAmount = params.amount;

    const preferFast = params.preferFastTransfer === true;
    const feeResult = await getCctpFees(
      sourceDomain,
      destDomain,
      outputAmount,
      preferFast
    );

    const bridgeFee = feeResult?.maxFee ?? 0n;
    const inputAmount = outputAmount + bridgeFee;
    const estimatedTime =
      feeResult?.isFast === true
        ? feeResult.estimatedTimeSeconds
        : this.getEstimatedTime(params.fromChain);

    const fromChainName =
      CHAIN_CONFIG[params.fromChain]?.name || `Chain ${params.fromChain}`;
    const toChainName =
      CHAIN_CONFIG[params.toChain]?.name || `Chain ${params.toChain}`;
    const speedLabel = preferFast ? " (Fast)" : " (Standard)";

    return {
      provider: "cctp",
      providerName: this.displayName,
      inputAmount,
      outputAmount,
      estimatedTime,
      gasFee: 0n,
      bridgeFee,
      platformFee: 0n,
      route: `${params.fromToken} on ${fromChainName} → ${params.toToken} on ${toChainName} via CCTP${speedLabel}`,
      cctpFast: feeResult?.isFast ?? false,
    };
  }

  getApprovalAddress(fromChain: number): `0x${string}` | undefined {
    return AGGREGATOR_CONTRACTS[fromChain];
  }

  getApproveAmount(params: BridgeParams, quote: BridgeQuote): bigint {
    return quote.inputAmount; // CCTP approves inputAmount (amount + bridgeFee)
  }

  async execute(
    params: BridgeParams,
    quote: BridgeQuote,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult> {
    const tokenAddress = getTokenAddressEVM("USDC", params.fromChain);
    const aggregator = AGGREGATOR_CONTRACTS[params.fromChain];
    const destDomain = CCTP_DOMAIN_IDS[params.toChain];

    if (!tokenAddress || !aggregator || destDomain === undefined) {
      throw new Error("CCTP not supported for this route");
    }

    const recipientBytes32 = pad(params.recipient as `0x${string}`, { size: 32 });
    const totalToBurn = quote.inputAmount;
    const maxFee = quote.bridgeFee;
    const minFinalityThreshold = quote.cctpFast ? 1000 : 2000;

    const providerData = encodeAbiParameters(
      [
        { type: "uint32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint32" },
        { type: "bytes" },
      ],
      [destDomain, recipientBytes32, maxFee, minFinalityThreshold, CCTP_FORWARDING_SERVICE_HOOK_DATA]
    );

    const hash = await ctx.writeContractAsync({
      address: aggregator,
      abi: AGGREGATOR_ABI,
      functionName: "bridge",
      args: [
        PROVIDER_IDS.cctp,
        tokenAddress,
        totalToBurn,
        BigInt(params.toChain),
        recipientBytes32,
        providerData,
      ],
      chainId: params.fromChain,
    });

    return { hash };
  }

  async getStatus(
    txHash: string,
    fromChain: number,
    _toChain: number,
    _options?: { depositAddress?: string; depositMemo?: string }
  ): Promise<TransactionStatus> {
    try {
      // Iris V2 API format: GET /v2/messages/{sourceDomainId}?transactionHash={txHash}
      const sourceDomainId = CCTP_DOMAIN_IDS[fromChain];
      if (sourceDomainId === undefined) {
        return { state: "pending", sourceTxHash: txHash, message: "Unknown source domain" };
      }

      const response = await fetch(
        `${CCTP_IRIS_API}/messages/${sourceDomainId}?transactionHash=${txHash}`
      );

      if (!response.ok) {
        return { state: "pending", sourceTxHash: txHash };
      }

      const data = await response.json();

      if (!data.messages || data.messages.length === 0) {
        return { state: "confirming", sourceTxHash: txHash, message: "Waiting for block confirmations..." };
      }

      const message = data.messages[0];
      const delayReason = message.delayReason as string | undefined;

      if (message.status === "complete") {
        return {
          state: "done",
          sourceTxHash: txHash,
          destinationTxHash: message.destinationTransaction?.transactionHash,
          message: "Bridge complete! Funds delivered.",
        };
      }

      if (delayReason === "insufficient_fee") {
        return {
          state: "confirming",
          sourceTxHash: txHash,
          message:
            "Insufficient fee was paid. The transfer used maxFee=0 so no relayer will complete the mint on destination. You may need to claim manually on the destination chain.",
        };
      }

      if (message.attestation && message.attestation !== "PENDING") {
        return {
          state: "attesting",
          sourceTxHash: txHash,
          message: "Attestation received, completing on destination...",
        };
      }

      return {
        state: "confirming",
        sourceTxHash: txHash,
        message: "Waiting for attestation from Circle...",
      };
    } catch {
      return {
        state: "pending",
        sourceTxHash: txHash,
        message: "Checking status...",
      };
    }
  }

  private getEstimatedTime(fromChain: number): number {
    // Estimated finality times in seconds
    const finalityTimes: Record<number, number> = {
      1: 960, // Ethereum: ~16 min
      42161: 900, // Arbitrum: ~15 min
      8453: 900, // Base: ~15 min
      10: 900, // Optimism: ~15 min
      137: 300, // Polygon: ~5 min
      43114: 60, // Avalanche: ~1 min
    };
    return finalityTimes[fromChain] || 900;
  }
}

export const cctpAdapter = new CCTPAdapter();
