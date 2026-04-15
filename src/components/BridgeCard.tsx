"use client";

import { useState, useMemo, useEffect } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChainSelector } from "./ChainSelector";
import { TokenSelector } from "./TokenSelector";
import { AmountInput } from "./AmountInput";
import { RouteDisplay } from "./RouteDisplay";
import { FeeBreakdown } from "./FeeBreakdown";
import { TransactionStatusDisplay } from "./TransactionStatus";
import { useBridgeQuote } from "@/hooks/useBridgeQuote";
import { useBridgeTransaction } from "@/hooks/useBridgeTransaction";
import { useAggregatorFeeBps } from "@/hooks/useAggregatorFeeBps";

import { useTronLink } from "@/contexts/TronLinkContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { useDamContext } from "@/hooks/useDamContext";
import { DEFAULT_SLIPPAGE_BPS } from "@/config/constants";
import { TRON_CHAIN_ID, SOLANA_CHAIN_ID } from "@/config/chains";
import { getTokensForChain } from "@/config/tokens";
import { cn } from "@/lib/utils";
import { isValidSolanaAddress } from "@/lib/solana";
import { mainnet, arbitrum } from "wagmi/chains";

export function BridgeCard() {
  const { address, isConnected } = useAccount();

  // Bridge state (CCTP default speed synced from settings)
  const [fromChain, setFromChain] = useState<number>(mainnet.id);
  const [toChain, setToChain] = useState<number>(arbitrum.id);
  const [fromToken, setFromToken] = useState("USDC");
  const [toToken, setToToken] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [preferFastTransfer, setPreferFastTransfer] = useState(false);

  const { tronAddress, isTronConnected, isTronAvailable, connectTron, disconnectTron } = useTronLink();
  const { solanaAddress, isSolanaConnected, isSolanaAvailable, connectSolana } = useSolanaWallet();
  const damCtx = useDamContext();
  const aggregatorFeeBps = useAggregatorFeeBps(fromChain);
  const [customRecipient, setCustomRecipient] = useState("");
  const [useCustomRecipient, setUseCustomRecipient] = useState(false);
  const selfRecipient = toChain === SOLANA_CHAIN_ID
    ? (solanaAddress ?? "")
    : toChain === TRON_CHAIN_ID
      ? (tronAddress ?? "")
      : (address ?? "");
  const recipient = useCustomRecipient && customRecipient.trim() ? customRecipient.trim() : selfRecipient;
  const sender = fromChain === SOLANA_CHAIN_ID
    ? solanaAddress
    : fromChain === TRON_CHAIN_ID
      ? tronAddress
      : address;
  const isSenderConnected = fromChain === SOLANA_CHAIN_ID
    ? isSolanaConnected
    : fromChain === TRON_CHAIN_ID
      ? isTronConnected
      : isConnected;

  // Default token when switching to Tron or Solana if current token not available
  useEffect(() => {
    const fromTokens = getTokensForChain(fromChain);
    const toTokens = getTokensForChain(toChain);
    if (fromChain === TRON_CHAIN_ID && !fromTokens.some((t) => t.symbol === fromToken)) {
      setFromToken("USDT");
    }
    if (fromChain === SOLANA_CHAIN_ID && !fromTokens.some((t) => t.symbol === fromToken)) {
      setFromToken("USDC");
    }
    if (toChain === TRON_CHAIN_ID && !toTokens.some((t) => t.symbol === toToken)) {
      setToToken("USDT");
    }
    if (toChain === SOLANA_CHAIN_ID && !toTokens.some((t) => t.symbol === toToken)) {
      setToToken("USDC");
    }
  }, [fromChain, toChain]);

  // Parse amount to bigint
  const parsedAmount = useMemo(() => {
    try {
      if (!amount || amount === "0" || amount === "") return 0n;
      return parseUnits(amount, 6); // USDC/USDT are 6 decimals
    } catch {
      return 0n;
    }
  }, [amount]);

  // Quote params (slippage/platform fee from settings; preferFastTransfer affects CCTP)
  const quoteParams = useMemo(() => {
    if (parsedAmount <= 0n) return null;
    return {
      fromChain,
      toChain,
      fromToken,
      toToken,
      amount: parsedAmount,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
      platformFeeBps: aggregatorFeeBps,
      preferFastTransfer,
    };
  }, [fromChain, toChain, fromToken, toToken, parsedAmount, preferFastTransfer, aggregatorFeeBps]);

  // Fetch quotes
  const { quotes, bestQuote, isLoading: quotesLoading, error: quoteError } =
    useBridgeQuote(quoteParams);

  const selectedQuote = quotes[selectedRouteIndex] || bestQuote;

  // Bridge transaction
  const {
    state: txState,
    sourceTxHash,
    error: txError,
    bridge,
    reset,
    executeMeta,
  } = useBridgeTransaction(
    selectedQuote,
    fromChain,
    toChain,
    fromToken,
    toToken,
    parsedAmount,
    recipient,
  );

  // Swap chains
  const handleSwapChains = () => {
    const prevFrom = fromChain;
    const prevTo = toChain;
    setFromChain(prevTo);
    setToChain(prevFrom);
  };

  // Show transaction status
  if (sourceTxHash && selectedQuote) {
    return (
      <div className="w-full max-w-md mx-auto">
        <TransactionStatusDisplay
          txHash={sourceTxHash}
          provider={selectedQuote.provider}
          fromChain={fromChain}
          toChain={toChain}
          onClose={reset}
          depositAddress={
            selectedQuote.provider === "near-intents"
              ? executeMeta?.depositAddress
              : undefined
          }
          depositMemo={
            selectedQuote.provider === "near-intents"
              ? executeMeta?.depositMemo
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="glass-card p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <h2 className="text-xl font-semibold text-white tracking-tight">Bridge</h2>
        </div>

        {/* FROM Section */}
        <div className="rounded-2xl bg-[var(--card-hover)] border border-[var(--border)] p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 items-start">
            <ChainSelector
              selectedChainId={fromChain}
              onSelect={setFromChain}
              excludeChainId={toChain}
              label="From"
            />
            <TokenSelector
              selectedToken={fromToken}
              onSelect={(token) => {
                setFromToken(token);
                if (token === "USDC") setToToken("USDC");
                else setToToken("USDT");
              }}
              chainId={fromChain}
              label="Token"
            />
          </div>
          <AmountInput
            value={amount}
            onChange={setAmount}
            token={fromToken}
            chainId={fromChain}
            label="Amount"
          />
        </div>

        {/* Swap Button - dedicated row so it never overflows */}
        <div className="flex justify-center items-center py-2">
          <button
            type="button"
            onClick={handleSwapChains}
            aria-label="Swap chains"
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
              "bg-[var(--card)] border-2 border-[var(--border)] shadow-lg",
              "hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 hover:scale-105",
              "transition-all duration-200 active:scale-95"
            )}
          >
            <svg
              className="w-4 h-4 text-[var(--muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </button>
        </div>

        {/* TO Section */}
        <div className="rounded-2xl bg-[var(--card-hover)] border border-[var(--border)] p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 items-start">
            <ChainSelector
              selectedChainId={toChain}
              onSelect={setToChain}
              label="To"
            />
            <TokenSelector
              selectedToken={toToken}
              onSelect={setToToken}
              chainId={toChain}
              label="Token"
            />
          </div>
          <AmountInput
            value={
              selectedQuote
                ? (Number(selectedQuote.outputAmount) / 1e6).toFixed(4)
                : ""
            }
            onChange={() => {}}
            token={toToken}
            chainId={toChain}
            label="You receive"
            readOnly
          />
        </div>

        {/* Recipient Address */}
        <div className="rounded-2xl bg-[var(--card-hover)] border border-[var(--border)] px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Recipient</span>
            <button
              type="button"
              onClick={() => {
                setUseCustomRecipient((v) => !v);
                if (useCustomRecipient) setCustomRecipient("");
              }}
              className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
            >
              {useCustomRecipient ? "Send to self" : "Send to other"}
            </button>
          </div>
          {useCustomRecipient ? (
            <>
              <input
                type="text"
                value={customRecipient}
                onChange={(e) => setCustomRecipient(e.target.value)}
                placeholder={
                  toChain === SOLANA_CHAIN_ID
                    ? "Solana address"
                    : toChain === TRON_CHAIN_ID
                      ? "Tron address (T...)"
                      : "0x..."
                }
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent text-sm text-white placeholder:text-[var(--muted)]/50 outline-none font-mono"
              />
              {toChain === SOLANA_CHAIN_ID && customRecipient.trim() && !isValidSolanaAddress(customRecipient.trim()) && (
                <p className="text-xs text-[var(--danger)] mt-1">Invalid Solana address</p>
              )}
            </>
          ) : (
            <p className="text-sm text-white font-mono truncate">
              {selfRecipient || "Connect wallet"}
            </p>
          )}
        </div>

        {/* Routes */}
        {(quotesLoading || quotes.length > 0) && (
          <RouteDisplay
            quotes={quotes}
            selectedIndex={selectedRouteIndex}
            onSelect={setSelectedRouteIndex}
            isLoading={quotesLoading}
          />
        )}

        {/* CCTP Fast vs Standard (only when CCTP is an option) */}
        {quotes.some((q) => q.provider === "cctp") && !quotesLoading && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--card-hover)] border border-[var(--border)] px-4 py-2.5">
            <span className="text-xs text-[var(--muted)]">CCTP speed</span>
            <div className="flex rounded-lg bg-[var(--card)] p-0.5 border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setPreferFastTransfer(false)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  !preferFastTransfer
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--muted)] hover:text-white"
                )}
              >
                Standard (~15m, no fee)
              </button>
              <button
                type="button"
                onClick={() => setPreferFastTransfer(true)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  preferFastTransfer
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--muted)] hover:text-white"
                )}
              >
                Fast (~30s, small fee)
              </button>
            </div>
          </div>
        )}

        {/* Fee Breakdown */}
        {selectedQuote && !quotesLoading && (
          <FeeBreakdown quote={selectedQuote} fromToken={fromToken} toToken={toToken} feeBps={aggregatorFeeBps} />
        )}

        {/* Error Display */}
        {(quoteError || txError) && (
          <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/30 p-3 text-xs text-[var(--danger)]">
            {quoteError || txError}
          </div>
        )}

        {/* Action Button */}
        {fromChain === SOLANA_CHAIN_ID && !isSolanaConnected ? (
          <div className="w-full space-y-2">
            {!isSolanaAvailable && (
              <p className="text-xs text-[var(--muted)] text-center">
                Install a Solana wallet extension (Phantom or Solflare) to bridge from Solana.
              </p>
            )}
            <button
              type="button"
              onClick={() => connectSolana().catch((e) => console.error(e))}
              disabled={!isSolanaAvailable}
              className={cn(
                "w-full py-4 rounded-xl font-semibold text-sm",
                "bg-[var(--primary)] hover:bg-[var(--primary-hover)]",
                "text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSolanaAvailable ? "Connect Solana" : "Solana wallet not detected"}
            </button>
          </div>
        ) : fromChain === TRON_CHAIN_ID && !isTronConnected ? (
          <div className="w-full space-y-2">
            {!isTronAvailable && (
              <p className="text-xs text-[var(--muted)] text-center">
                Install the TronLink extension to bridge from Tron.
              </p>
            )}
            <button
              type="button"
              onClick={() => connectTron().catch((e) => console.error(e))}
              disabled={!isTronAvailable}
              className={cn(
                "w-full py-4 rounded-xl font-semibold text-sm",
                "bg-[var(--primary)] hover:bg-[var(--primary-hover)]",
                "text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isTronAvailable ? "Connect Tron" : "TronLink not detected"}
            </button>
          </div>
        ) : fromChain !== TRON_CHAIN_ID && fromChain !== SOLANA_CHAIN_ID && !isConnected && !damCtx.isDam ? (
          <div className="w-full">
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button
                  onClick={openConnectModal}
                  className={cn(
                    "w-full py-4 rounded-xl font-semibold text-sm",
                    "bg-[var(--primary)] hover:bg-[var(--primary-hover)]",
                    "text-white transition-all active:scale-[0.98]"
                  )}
                >
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          </div>
        ) : parsedAmount <= 0n ? (
          <button
            type="button"
            disabled
            className="w-full py-4 rounded-xl font-semibold text-sm bg-[var(--card-hover)] border border-[var(--border)] text-[var(--muted)] cursor-not-allowed"
          >
            Enter amount
          </button>
        ) : quotesLoading ? (
          <button
            disabled
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[var(--border)] text-[var(--muted)] cursor-not-allowed"
          >
            Finding routes...
          </button>
        ) : !selectedQuote ? (
          <button
            disabled
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[var(--border)] text-[var(--muted)] cursor-not-allowed"
          >
            No routes available
          </button>
        ) : !recipient && (fromChain === TRON_CHAIN_ID || toChain === TRON_CHAIN_ID || fromChain === SOLANA_CHAIN_ID || toChain === SOLANA_CHAIN_ID) ? (
          <p className="text-center py-3 text-sm text-[var(--muted)]">
            {toChain === SOLANA_CHAIN_ID
              ? "Connect Solana wallet or enter a Solana recipient address."
              : toChain === TRON_CHAIN_ID
                ? "Connect Tron to receive on Tron."
                : fromChain === SOLANA_CHAIN_ID
                  ? "Connect Solana to send from Solana."
                  : "Connect Tron to send from Tron."}
          </p>
        ) : (
          <button
            onClick={bridge}
            disabled={txState === "bridging" || txState === "approving"}
            className={cn(
              "w-full py-4 rounded-xl font-semibold text-sm transition-all",
              txState === "bridging" || txState === "approving"
                ? "bg-[var(--primary)]/50 text-white/70 cursor-wait pulse-glow"
                : "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white active:scale-[0.98]"
            )}
          >
            {txState === "bridging"
              ? "Bridging..."
              : `Bridge ${fromToken} to ${toToken}`}
          </button>
        )}

        {/* Powered by line */}
        <p className="text-center text-xs text-[var(--muted)]/70 pt-2 border-t border-[var(--border)]/50">
          Powered by CCTP, USDT0 (LayerZero), NEAR Intents, and Across
        </p>
      </div>
    </div>
  );
}
