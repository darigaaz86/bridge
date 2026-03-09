export type BridgeProvider = "cctp" | "usdt0" | "near-intents";

export type TransactionState =
  | "idle"
  | "approving"
  | "approved"
  | "bridging"
  | "pending"
  | "confirming"
  | "attesting"
  | "completing"
  | "done"
  | "failed";

export interface BridgeQuote {
  provider: BridgeProvider;
  providerName: string;
  inputAmount: bigint;
  outputAmount: bigint;
  estimatedTime: number; // seconds
  gasFee: bigint;
  bridgeFee: bigint;
  platformFee: bigint;
  route: string; // human-readable description e.g. "USDC on Ethereum → USDC on Arbitrum via CCTP"
  /** True when CCTP quote uses Fast Transfer (minFinalityThreshold 1000); used at execution */
  cctpFast?: boolean;
}

export interface BridgeParams {
  fromChain: number;
  toChain: number;
  fromToken: string; // token symbol (USDC, USDT, USDT0)
  toToken: string;
  amount: bigint;
  /** EVM: 0x... ; Tron: base58. Destination chain address. */
  recipient: string;
  /** EVM: 0x... ; Tron: base58. Origin chain address for refunds. Required for 1Click when origin is Tron. */
  refundTo?: string;
  slippageBps?: number;
  /** Platform fee in bps; when set, adapters use this instead of default */
  platformFeeBps?: number;
  /** When true, CCTP uses Fast Transfer (~20–60s) with protocol fee; when false, Standard (~15m, no protocol fee) */
  preferFastTransfer?: boolean;
}

export interface TransactionStatus {
  state: TransactionState;
  sourceTxHash?: string;
  destinationTxHash?: string;
  message?: string;
}

export interface IBridgeAdapter {
  name: BridgeProvider;
  displayName: string;

  /** Check if this adapter can handle the given route */
  supportsRoute(
    fromChain: number,
    toChain: number,
    fromToken: string,
    toToken: string
  ): boolean;

  /** Get a quote for the bridge transfer */
  getQuote(params: BridgeParams): Promise<BridgeQuote | null>;

  /** Get the spender address that needs token approval */
  getApprovalAddress(fromChain: number): `0x${string}` | undefined;

  /** Get current transaction status (options used by NEAR Intents: depositAddress, depositMemo) */
  getStatus(
    txHash: string,
    fromChain: number,
    toChain: number,
    options?: { depositAddress?: string; depositMemo?: string }
  ): Promise<TransactionStatus>;
}
