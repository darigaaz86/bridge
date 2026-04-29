import { CHAIN_CONFIG } from "@/config/chains";
import { getTokenAddressEVM, TOKENS } from "@/config/tokens";
import { AGGREGATOR_CONTRACTS, PROVIDER_IDS } from "@/config/contracts";
import { AGGREGATOR_ABI } from "@/abi/aggregator";
import { pad, encodeAbiParameters } from "viem";
import type { TokenInfo } from "@/config/tokens";
import type {
  IBridgeAdapter,
  BridgeParams,
  BridgeQuote,
  TransactionStatus,
  ExecuteContext,
  ExecuteResult,
} from "./types";

const ACROSS_API = "https://app.across.to/api";

/** Response from /suggested-fees */
interface AcrossFeeResponse {
  estimatedFillTimeSec: number;
  totalRelayFee: { pct: string; total: string };
  relayerCapitalFee: { pct: string; total: string };
  relayerGasFee: { pct: string; total: string };
  lpFee: { pct: string; total: string };
  isAmountTooLow: boolean;
  spokePoolAddress: string;
  exclusiveRelayer: string;
  exclusivityDeadline: number;
  timestamp: string;
  fillDeadline: string;
  outputAmount: string;
  limits: {
    minDeposit: string;
    maxDeposit: string;
    maxDepositInstant: string;
  };
}

class AcrossAdapter implements IBridgeAdapter {
  name = "across" as const;
  displayName = "Across Protocol";

  supportsRoute(
    fromChain: number,
    toChain: number,
    fromToken: string,
    toToken: string,
  ): boolean {
    if (fromChain === toChain) return false;
    // Across supports same-token bridges for USDC and USDT on major EVM chains
    if (fromToken !== toToken) return false;
    if (fromToken !== "USDC" && fromToken !== "USDT") return false;
    const inputToken = getTokenAddressEVM(fromToken, fromChain);
    const outputToken = getTokenAddressEVM(toToken, toChain);
    return !!inputToken && !!outputToken;
  }

  async getQuote(params: BridgeParams): Promise<BridgeQuote | null> {
    if (!this.supportsRoute(params.fromChain, params.toChain, params.fromToken, params.toToken)) {
      return null;
    }

    const inputToken = getTokenAddressEVM(params.fromToken, params.fromChain);
    const outputToken = getTokenAddressEVM(params.toToken, params.toChain);
    if (!inputToken || !outputToken) return null;

    try {
      const qs = new URLSearchParams({
        inputToken,
        outputToken,
        originChainId: String(params.fromChain),
        destinationChainId: String(params.toChain),
        amount: params.amount.toString(),
      });

      const res = await fetch(`${ACROSS_API}/suggested-fees?${qs}`);
      if (!res.ok) return null;

      const data: AcrossFeeResponse = await res.json();
      if (data.isAmountTooLow) return null;

      const outputAmount = BigInt(data.outputAmount);
      const bridgeFee = params.amount - outputAmount;

      const fromChainName = CHAIN_CONFIG[params.fromChain]?.name || `Chain ${params.fromChain}`;
      const toChainName = CHAIN_CONFIG[params.toChain]?.name || `Chain ${params.toChain}`;

      return {
        provider: "across",
        providerName: this.displayName,
        inputAmount: params.amount,
        outputAmount,
        estimatedTime: data.estimatedFillTimeSec || 30,
        gasFee: 0n,
        bridgeFee: bridgeFee > 0n ? bridgeFee : 0n,
        platformFee: 0n,
        route: `${params.fromToken} on ${fromChainName} → ${params.toToken} on ${toChainName} via Across`,
        // Store fee response data for execute()
        _acrossMeta: {
          spokePoolAddress: data.spokePoolAddress,
          outputAmount: data.outputAmount,
          exclusiveRelayer: data.exclusiveRelayer,
          exclusivityDeadline: String(data.exclusivityDeadline),
          timestamp: data.timestamp,
          fillDeadline: data.fillDeadline,
        },
      } as BridgeQuote & { _acrossMeta: Record<string, string> };
    } catch {
      return null;
    }
  }

  getApprovalAddress(fromChain: number): `0x${string}` | undefined {
    return AGGREGATOR_CONTRACTS[fromChain];
  }

  getApproveAmount(params: BridgeParams, _quote: BridgeQuote): bigint {
    return params.amount;
  }

  async execute(
    params: BridgeParams,
    quote: BridgeQuote,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult> {
    const meta = (quote as BridgeQuote & { _acrossMeta?: Record<string, string> })._acrossMeta;
    if (!meta) throw new Error("Missing Across quote metadata. Please refresh the quote.");

    const aggregator = AGGREGATOR_CONTRACTS[params.fromChain];
    if (!aggregator) throw new Error("Aggregator not configured for this chain");

    const inputToken = getTokenAddressEVM(params.fromToken, params.fromChain);
    const outputToken = getTokenAddressEVM(params.toToken, params.toChain);
    const spokePool = meta.spokePoolAddress as `0x${string}`;

    if (!inputToken || !outputToken || !spokePool) {
      throw new Error("Across: missing token or SpokePool address");
    }

    const recipientBytes32 = pad(params.recipient as `0x${string}`, { size: 32 });

    // Encode provider data for AcrossProvider.executeBridge()
    const providerData = encodeAbiParameters(
      [
        { type: "address" },  // spokePool
        { type: "address" },  // depositor (will be the AcrossProvider contract)
        { type: "address" },  // recipient
        { type: "address" },  // outputToken
        { type: "uint256" },  // outputAmount
        { type: "uint256" },  // destinationChainId
        { type: "address" },  // exclusiveRelayer
        { type: "uint32" },   // quoteTimestamp
        { type: "uint32" },   // fillDeadline
        { type: "uint32" },   // exclusivityDeadline
      ],
      [
        spokePool,
        aggregator, // depositor = aggregator's AcrossProvider (will be overridden by the provider contract address)
        params.recipient as `0x${string}`,
        outputToken,
        BigInt(meta.outputAmount),
        BigInt(params.toChain),
        meta.exclusiveRelayer as `0x${string}`,
        Number(meta.timestamp),
        Number(meta.fillDeadline),
        Number(meta.exclusivityDeadline),
      ],
    );

    const hash = await ctx.writeContractAsync({
      address: aggregator,
      abi: AGGREGATOR_ABI,
      functionName: "bridge",
      args: [
        PROVIDER_IDS.across,
        inputToken,
        params.amount,
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
  ): Promise<TransactionStatus> {
    try {
      const qs = new URLSearchParams({
        originChainId: String(fromChain),
        depositTxHash: txHash,
      });
      const res = await fetch(`${ACROSS_API}/deposit/status?${qs}`);
      if (!res.ok) {
        return { state: "pending", sourceTxHash: txHash, message: "Checking status..." };
      }

      const data = await res.json();
      const status = data.status as string;

      if (status === "filled") {
        return {
          state: "done",
          sourceTxHash: txHash,
          destinationTxHash: data.fillTx,
          message: "Bridge complete! Funds delivered via Across.",
        };
      }

      if (status === "expired") {
        return {
          state: "failed",
          sourceTxHash: txHash,
          message: "Deposit expired. Funds can be recovered from the SpokePool.",
        };
      }

      return {
        state: "confirming",
        sourceTxHash: txHash,
        message: "Relayer filling your order...",
      };
    } catch {
      return { state: "pending", sourceTxHash: txHash, message: "Checking status..." };
    }
  }

  async getSupportedTokens(chainId: number): Promise<TokenInfo[]> {
    try {
      const usdcAddress = getTokenAddressEVM("USDC", chainId);
      const usdtAddress = getTokenAddressEVM("USDT", chainId);

      // Return empty for non-EVM chains or chains without Across token addresses
      if (!usdcAddress || !usdtAddress) {
        return [];
      }

      const usdc = TOKENS["USDC"];
      const usdt = TOKENS["USDT"];

      const result: TokenInfo[] = [];
      if (usdc) {
        result.push(usdc);
      }
      if (usdt) {
        result.push(usdt);
      }
      return result;
    } catch {
      return [];
    }
  }
}

export const acrossAdapter = new AcrossAdapter();
