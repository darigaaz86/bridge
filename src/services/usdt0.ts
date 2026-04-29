import {
  USDT0_OFT_CONTRACTS,
  LZ_ENDPOINT_IDS,
  LZ_SCAN_API,
  AGGREGATOR_CONTRACTS,
  PROVIDER_IDS,
} from "@/config/contracts";
import { CHAIN_CONFIG } from "@/config/chains";
import { PROVIDER_NAMES } from "@/config/constants";
import { pad, encodeAbiParameters } from "viem";
import { AGGREGATOR_ABI } from "@/abi/aggregator";
import { OFT_ABI } from "@/abi/oft";
import { TOKENS } from "@/config/tokens";
import type { TokenInfo } from "@/config/tokens";
import type {
  IBridgeAdapter,
  BridgeParams,
  BridgeQuote,
  TransactionStatus,
  ExecuteContext,
  ExecuteResult,
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

    const platformFee = 0n;

    // Calculate bridge fee: 3 bps for Legacy Mesh, 0 for native OFT
    const isLegacyMesh =
      LEGACY_MESH_CHAINS.has(params.fromChain) ||
      LEGACY_MESH_CHAINS.has(params.toChain);
    const bridgeFeeBps = isLegacyMesh ? 3 : 0;
    const bridgeFee = (params.amount * BigInt(bridgeFeeBps)) / 10000n;
    const outputAmount = params.amount - bridgeFee;

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
    return AGGREGATOR_CONTRACTS[fromChain];
  }

  async execute(
    params: BridgeParams,
    quote: BridgeQuote,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult> {
    const oftContract = USDT0_OFT_CONTRACTS[params.fromChain];
    const aggregator = AGGREGATOR_CONTRACTS[params.fromChain];
    const dstEid = LZ_ENDPOINT_IDS[params.toChain];

    if (!oftContract || !aggregator || !dstEid) {
      throw new Error("USDT0 OFT not supported for this route");
    }

    const recipientBytes32 = pad(params.recipient as `0x${string}`, { size: 32 });
    const minAmountLD = (params.amount * 995n) / 1000n; // 0.5% slippage
    const extraOptions = "0x" as `0x${string}`;
    const composeMsg = "0x" as `0x${string}`;
    const oftCmd = "0x" as `0x${string}`;

    // Quote the LayerZero fee from the OFT contract (needed for msg.value)
    const sendParam = {
      dstEid,
      to: recipientBytes32,
      amountLD: params.amount,
      minAmountLD,
      extraOptions,
      composeMsg,
      oftCmd,
    };

    let nativeFee: bigint;
    if (ctx.publicClient) {
      try {
        const msgFee = await ctx.publicClient.readContract({
          address: oftContract,
          abi: OFT_ABI,
          functionName: "quoteSend",
          args: [sendParam, false],
        }) as { nativeFee: bigint; lzTokenFee: bigint };
        nativeFee = msgFee.nativeFee;
      } catch {
        throw new Error(
          "Could not get USDT0 bridge fee. Ensure you have enough native token (ETH) for gas and the LayerZero fee."
        );
      }
    } else {
      nativeFee = 100000000000000n;
    }

    const providerData = encodeAbiParameters(
      [
        { type: "uint32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes" },
        { type: "bytes" },
        { type: "bytes" },
      ],
      [dstEid, recipientBytes32, minAmountLD, extraOptions, composeMsg, oftCmd]
    );

    const hash = await ctx.writeContractAsync({
      address: aggregator,
      abi: AGGREGATOR_ABI,
      functionName: "bridge",
      args: [
        PROVIDER_IDS.usdt0,
        oftContract,
        params.amount,
        BigInt(params.toChain),
        recipientBytes32,
        providerData,
      ],
      value: nativeFee,
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

  async getSupportedTokens(chainId: number): Promise<TokenInfo[]> {
    try {
      if (USDT0_OFT_CONTRACTS[chainId] === undefined) {
        return [];
      }
      const usdt = TOKENS["USDT"];
      const usdt0 = TOKENS["USDT0"];
      const result: TokenInfo[] = [];
      if (usdt && usdt.addresses[chainId]) {
        result.push(usdt);
      }
      if (usdt0 && usdt0.addresses[chainId]) {
        result.push(usdt0);
      }
      return result;
    } catch {
      return [];
    }
  }
}

export const usdt0Adapter = new USDT0Adapter();
