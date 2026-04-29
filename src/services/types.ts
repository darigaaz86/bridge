import type { TokenInfo } from "@/config/tokens";

export type BridgeProvider = "cctp" | "usdt0" | "near-intents" | (string & {});

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
  provider: string;
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

/** Context passed to adapter.execute() — provides wallet interaction capabilities */
export interface ExecuteContext {
  /** wagmi writeContractAsync for sending EVM transactions */
  writeContractAsync: (args: Record<string, unknown>) => Promise<string>;
  /** viem PublicClient for reading on-chain state */
  publicClient: {
    readContract: (args: Record<string, unknown>) => Promise<unknown>;
  } | null;
  /** Connected EVM address */
  evmAddress?: string;
  /** Connected Tron address */
  tronAddress?: string;
  /** Solana wallet adapter state — used for signing SPL token transfers */
  solanaWallet?: {
    publicKey: { toBase58: () => string; toBuffer: () => Buffer };
    sendTransaction: (tx: unknown, connection: unknown) => Promise<string>;
  } | null;
  /** Connected Solana address (base58) */
  solanaAddress?: string;
}

/** Result returned by adapter.execute() */
export interface ExecuteResult {
  /** Transaction hash */
  hash: string;
  /** Provider-specific metadata (e.g. depositAddress, depositMemo for NEAR Intents) */
  meta?: Record<string, string>;
}

export interface IBridgeAdapter {
  name: string;
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

  /** Amount to approve (defaults to params.amount if not implemented) */
  getApproveAmount?(params: BridgeParams, quote: BridgeQuote): bigint;

  /** Whether this adapter needs EVM approval (return false for e.g. Tron direct transfers) */
  needsApproval?(fromChain: number): boolean;

  /** Execute the bridge transaction. Each adapter owns its own tx-building logic. */
  execute(
    params: BridgeParams,
    quote: BridgeQuote,
    ctx: ExecuteContext,
  ): Promise<ExecuteResult>;

  /** Get current transaction status (options used by NEAR Intents: depositAddress, depositMemo) */
  getStatus(
    txHash: string,
    fromChain: number,
    toChain: number,
    options?: { depositAddress?: string; depositMemo?: string }
  ): Promise<TransactionStatus>;

  /** Return tokens this adapter supports on the given chain */
  getSupportedTokens(chainId: number): Promise<TokenInfo[]>;
}
