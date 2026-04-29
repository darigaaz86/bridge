# Implementation Plan: Dynamic Token Discovery

## Overview

Replace the hardcoded token list with a dynamic token registry that aggregates tokens from all bridge adapters. Implementation proceeds bottom-up: types → adapter methods → router aggregation → caching registry → React hook → UI components.

## Tasks

- [x] 1. Extend types and token config
  - [x] 1.1 Add `TokenInfo` type alias and `getSupportedTokens` to `IBridgeAdapter`
    - In `src/config/tokens.ts`, export `TokenInfo` as a type alias for the existing `TokenConfig` interface
    - In `src/services/types.ts`, add `getSupportedTokens(chainId: number): Promise<TokenInfo[]>` to the `IBridgeAdapter` interface
    - Import `TokenInfo` from `@/config/tokens`
    - _Requirements: 1.1_

- [x] 2. Implement adapter `getSupportedTokens` methods
  - [x] 2.1 Implement `getSupportedTokens` on `CCTPAdapter`
    - Return `[USDC TokenInfo]` with the correct address when `CCTP_DOMAIN_IDS[chainId]` exists
    - Return `[]` for unsupported chains
    - Wrap in try/catch, return `[]` on error
    - _Requirements: 1.2, 1.3, 1.4, 3.1, 3.2_

  - [x] 2.2 Implement `getSupportedTokens` on `USDT0Adapter`
    - Return `[USDT TokenInfo, USDT0 TokenInfo]` with correct addresses when `USDT0_OFT_CONTRACTS[chainId]` exists
    - Return `[]` for unsupported chains
    - Wrap in try/catch, return `[]` on error
    - _Requirements: 1.2, 1.3, 1.4, 4.1, 4.2_

  - [x] 2.3 Implement `getSupportedTokens` on `AcrossAdapter`
    - Return `[USDC TokenInfo, USDT TokenInfo]` for EVM chains where `getTokenAddressEVM` returns addresses for both tokens
    - Return `[]` for non-EVM chains or chains without Across token addresses
    - Wrap in try/catch, return `[]` on error
    - _Requirements: 1.2, 1.3, 1.4, 5.1, 5.2_

  - [x] 2.4 Implement `getSupportedTokens` on `NearIntentsAdapter`
    - Fetch from `NEAR_INTENTS_TOKENS_URL`, filter by `BLOCKCHAIN_TO_CHAIN_ID` allowlist
    - Remove the `ALLOWED_SYMBOLS` filter to include all tokens (ETH, WETH, BTC, ARB, SOL, etc.)
    - Map each API token to a `TokenInfo` with symbol, name, decimals, icon, and address for the requested chain
    - Return `[]` on network failure or malformed response
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.5 Write property tests for adapter `getSupportedTokens`
    - **Property 1: Adapter getSupportedTokens returns valid TokenInfo arrays**
    - **Validates: Requirements 1.2, 1.3, 1.4**

  - [ ]* 2.6 Write property test for NEAR Intents chain filtering
    - **Property 2: NEAR Intents filters to supported chains only**
    - **Validates: Requirements 2.2**

  - [ ]* 2.7 Write property test for NEAR Intents token mapping
    - **Property 3: NEAR Intents token mapping preserves data**
    - **Validates: Requirements 2.3**

- [x] 3. Checkpoint - Ensure all adapter implementations are correct
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement router token aggregation
  - [x] 4.1 Add `getAllSupportedTokens` to the router
    - In `src/services/router.ts`, add `export async function getAllSupportedTokens(chainId: number): Promise<TokenInfo[]>`
    - Call `adapter.getSupportedTokens(chainId)` on all registered adapters via `Promise.allSettled`
    - Merge results into a `Map<string, TokenInfo>` keyed by `symbol.toUpperCase()`
    - When duplicate symbols: prefer the entry that has an EVM contract address (`0x`-prefixed) for the requested chain
    - Sort final array alphabetically by symbol
    - If all adapters return empty arrays, return hardcoded fallback tokens for the chain via `getTokensForChain(chainId)`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 4.2 Write property test for router deduplication
    - **Property 4: Router deduplication by symbol**
    - **Validates: Requirements 6.3**

  - [ ]* 4.3 Write property test for EVM address preference
    - **Property 5: Router prefers entries with EVM contract addresses**
    - **Validates: Requirements 6.4**

  - [ ]* 4.4 Write property test for alphabetical sort
    - **Property 6: Router sorts alphabetically**
    - **Validates: Requirements 6.5**

- [x] 5. Implement token registry caching
  - [x] 5.1 Add `getTokensForChainAsync` with in-memory cache to `src/config/tokens.ts`
    - Add `CacheEntry` interface with `tokens: TokenInfo[]` and `timestamp: number`
    - Add module-level `tokenCache = new Map<number, CacheEntry>()` with 5-minute TTL
    - Implement `getTokensForChainAsync(chainId: number): Promise<TokenInfo[]>` that checks cache, calls `getAllSupportedTokens` on miss
    - Merge hardcoded EVM addresses into dynamic results (dynamic addresses take precedence, hardcoded fill gaps)
    - Return hardcoded fallback if merged result is empty
    - Keep existing synchronous `getTokensForChain` for backward compatibility
    - Initialize cache with hardcoded fallback entries for all supported chains on first access
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 10.1, 10.2, 10.3, 10.4, 11.1_

  - [ ]* 5.2 Write property test for cache TTL behavior
    - **Property 7: Cache respects TTL**
    - **Validates: Requirements 7.2**

  - [ ]* 5.3 Write property test for EVM address merge precedence
    - **Property 8: EVM address merge precedence**
    - **Validates: Requirements 7.4, 10.1, 10.2, 10.3**

- [x] 6. Checkpoint - Ensure registry and router tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Create `useTokens` hook and update UI components
  - [x] 7.1 Create `useTokens` hook in `src/hooks/useTokens.ts`
    - Implement `useTokens(chainId: number): { tokens: TokenInfo[]; isLoading: boolean }`
    - On mount and when `chainId` changes, call `getTokensForChainAsync(chainId)`
    - Return hardcoded tokens as initial state while async fetch is in flight
    - On success, update tokens to the dynamic list
    - On failure, keep showing hardcoded tokens without error display
    - _Requirements: 8.1, 11.3_

  - [x] 7.2 Update `TokenSelector` to use dynamic tokens
    - Replace `getTokensForChain(chainId)` with `useTokens(chainId)` hook
    - Show a small spinner/skeleton inside the dropdown while `isLoading` is true
    - Render all returned tokens in the dropdown
    - Display hardcoded fallback tokens if registry returns empty list
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 7.3 Update `BridgeCard` to use dynamic tokens and decimal-aware parsing
    - Use `useTokens(fromChain)` and `useTokens(toChain)` to get dynamic token lists
    - When chain changes and current token isn't in the new list: reset to USDC if available, else first token in list
    - Replace hardcoded `parseUnits(amount, 6)` with `parseUnits(amount, selectedTokenInfo.decimals)` using `TokenInfo` from the registry
    - Update output amount formatting to use `toToken`'s decimals instead of hardcoded `1e6`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 7.4 Write property test for token reset logic
    - **Property 9: Token reset selects USDC or first available**
    - **Validates: Requirements 9.3, 9.4**

  - [ ]* 7.5 Write property test for decimal-aware amount parsing
    - **Property 10: Decimal-aware amount parsing**
    - **Validates: Requirements 9.6**

  - [ ]* 7.6 Write unit tests for `useTokens` hook and `TokenSelector`
    - Test loading state transitions
    - Test fallback behavior when registry returns empty
    - Test that all dynamic tokens render in dropdown
    - _Requirements: 8.2, 8.3, 8.4, 11.3_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing synchronous `getTokensForChain` and `getTokenAddress` functions remain for backward compatibility
