import { CHAIN_CONFIG } from "@/config/chains";
import { getTokenAddressEVM } from "@/config/tokens";
import type {
  IBridgeAdapter,
  BridgeParams,
  BridgeQuote,
  TransactionStatus,
  ExecuteContext,
  ExecuteResult,
} from "./types";

const ACROSS_API = "https://app.across.to/api";

// SpokePool ABI — only the depositV3 function we need
const SPOKE_POOL_ABI = [
  {
    name: "depositV3",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "depositor", type: "address" },
      { name: "recipient", type: "address" },
      { name: "inputToken", type: "address" },
      { name: "outputToken", type: "address" },
      { name: "inputAmount", type: "uint256" },
      { name: "outputAmount", type: "uint256" },
      { name: "destinationChainId", type: "uint256" },
      { name: "exclusiveRelayer", type: "address" },
      { name: "quoteTimestamp", type: "uint32" },
      { name: "fillDeadline", type: "uint32" },
      { name: "exclusivityDeadline", type: "uint32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

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
    // Will be set dynamically from the quote's spokePoolAddress
    // For now return undefined — execute() handles approval target
    return undefined;
  }

  needsApproval(): boolean {
    // We handle approval inside execute() since the spender (SpokePool) comes from the API
    return false;
  }

  async execute(
    params: BridgeParams,
    quote: BridgeQuote,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult> {
    const meta = (quote as BridgeQuote & { _acrossMeta?: Record<string, string> })._acrossMeta;
    if (!meta) throw new Error("Missing Across quote metadata. Please refresh the quote.");

    const inputToken = getTokenAddressEVM(params.fromToken, params.fromChain) as `0x${string}`;
    const outputToken = getTokenAddressEVM(params.toToken, params.toChain) as `0x${string}`;
    const spokePool = meta.spokePoolAddress as `0x${string}`;

    if (!inputToken || !outputToken || !spokePool) {
      throw new Error("Across: missing token or SpokePool address");
    }

    // Approve SpokePool to spend input tokens
    if (ctx.publicClient && ctx.evmAddress) {
      const currentAllowance = await ctx.publicClient.readContract({
        address: inputToken,
        abi: [{ name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
        functionName: "allowance",
        args: [ctx.evmAddress as `0x${string}`, spokePool],
      }) as bigint;

      if (currentAllowance < params.amount) {
        await ctx.writeContractAsync({
          address: inputToken,
          abi: [{ name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }],
          functionName: "approve",
          args: [spokePool, params.amount],
          chainId: params.fromChain,
        });
      }
    }

    const depositor = ctx.evmAddress as `0x${string}`;
    const recipient = params.recipient as `0x${string}`;

    const hash = await ctx.writeContractAsync({
      address: spokePool,
      abi: SPOKE_POOL_ABI,
      functionName: "depositV3",
      args: [
        depositor,
        recipient,
        inputToken,
        outputToken,
        params.amount,
        BigInt(meta.outputAmount),
        BigInt(params.toChain),
        meta.exclusiveRelayer as `0x${string}`,
        Number(meta.timestamp),
        Number(meta.fillDeadline),
        Number(meta.exclusivityDeadline),
        "0x" as `0x${string}`, // empty message
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
}

export const acrossAdapter = new AcrossAdapter();
