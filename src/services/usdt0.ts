import {
  USDT0_OFT_CONTRACTS,
  LZ_ENDPOINT_IDS,
  LZ_SCAN_API,
} from "@/config/contracts";
import { CHAIN_CONFIG } from "@/config/chains";
import { PLATFORM_FEE_BPS, PROVIDER_NAMES } from "@/config/constants";
import { calculatePlatformFee } from "@/lib/fees";
import type {
  IBridgeAdapter,
  BridgeParams,
  BridgeQuote,
  TransactionStatus,
} from "./types";

// Legacy Mesh chains that charge 3 bps
const LEGACY_MESH_CHAINS = new Set([1]); // Ethereum mainnet uses OFT Adapter (lock/unlock)

class USDT0Adapter implements IBridgeAdapter {
  name = "usdt0" as const;
  displayName = PROVIDER_NAMES.usdt0;

  supportsRoute(
    fromChain: number,
    toChain: number,
    fromToken: string,
    toToken: string
  ): boolean {
    // USDT0 supports USDT and USDT0 tokens
    const validTokens = ["USDT", "USDT0"];
    if (!validTokens.includes(fromToken) || !validTokens.includes(toToken))
      return false;
    // Both chains must have USDT0 OFT deployment
    return (
      USDT0_OFT_CONTRACTS[fromChain] !== undefined &&
      USDT0_OFT_CONTRACTS[toChain] !== undefined &&
      LZ_ENDPOINT_IDS[fromChain] !== undefined &&
      LZ_ENDPOINT_IDS[toChain] !== undefined &&
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

    const platformFeeBps = params.platformFeeBps ?? PLATFORM_FEE_BPS;
    const platformFee = calculatePlatformFee(params.amount, platformFeeBps);

    // Calculate bridge fee: 3 bps for Legacy Mesh, 0 for native OFT
    const isLegacyMesh =
      LEGACY_MESH_CHAINS.has(params.fromChain) ||
      LEGACY_MESH_CHAINS.has(params.toChain);
    const bridgeFeeBps = isLegacyMesh ? 3 : 0;
    const afterPlatformFee = params.amount - platformFee;
    const bridgeFee = (afterPlatformFee * BigInt(bridgeFeeBps)) / 10000n;
    const outputAmount = afterPlatformFee - bridgeFee;

    const estimatedTime = this.getEstimatedTime(params.fromChain);

    const fromChainName =
      CHAIN_CONFIG[params.fromChain]?.name || `Chain ${params.fromChain}`;
    const toChainName =
      CHAIN_CONFIG[params.toChain]?.name || `Chain ${params.toChain}`;

    const meshLabel = isLegacyMesh ? " (Legacy Mesh)" : "";

    return {
      provider: "usdt0",
      providerName: this.displayName,
      inputAmount: params.amount,
      outputAmount,
      estimatedTime,
      gasFee: 0n, // LZ messaging fees paid as msg.value, estimated by frontend
      bridgeFee,
      platformFee,
      route: `${params.fromToken} on ${fromChainName} → USDT0 on ${toChainName} via LayerZero OFT${meshLabel}`,
    };
  }

  getApprovalAddress(fromChain: number): `0x${string}` | undefined {
    return USDT0_OFT_CONTRACTS[fromChain];
  }

  async getStatus(
    txHash: string,
    fromChain: number,
    _toChain: number
  ): Promise<TransactionStatus> {
    try {
      const response = await fetch(
        `${LZ_SCAN_API}/messages/tx/${txHash}`
      );

      if (!response.ok) {
        return { state: "pending", sourceTxHash: txHash };
      }

      const data = await response.json();

      if (!data.messages || data.messages.length === 0) {
        return {
          state: "confirming",
          sourceTxHash: txHash,
          message: "Waiting for LayerZero DVN verification...",
        };
      }

      const message = data.messages[0];

      if (message.status === "DELIVERED") {
        return {
          state: "done",
          sourceTxHash: txHash,
          destinationTxHash: message.dstTxHash,
          message: "Bridge complete! USDT0 delivered.",
        };
      }

      if (message.status === "INFLIGHT") {
        return {
          state: "attesting",
          sourceTxHash: txHash,
          message: "Message in flight, DVNs verifying...",
        };
      }

      return {
        state: "confirming",
        sourceTxHash: txHash,
        message: "Processing cross-chain message...",
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
    // USDT0 via LayerZero is generally faster
    const times: Record<number, number> = {
      1: 120, // Ethereum: ~2 min
      42161: 40, // Arbitrum: ~40s
      8453: 40, // Base: ~40s
      10: 40, // Optimism: ~40s
      137: 30, // Polygon: ~30s
      43114: 30, // Avalanche: ~30s
      56: 30, // BSC: ~30s
    };
    return times[fromChain] || 60;
  }
}

export const usdt0Adapter = new USDT0Adapter();
