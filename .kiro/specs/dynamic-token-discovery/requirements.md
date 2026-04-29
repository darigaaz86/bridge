# Requirements Document

## Introduction

Dynamic Token Discovery replaces the hardcoded token list (USDC, USDT, USDT0) with a dynamically built token registry aggregated from all registered bridge adapters. Each adapter reports the tokens it supports on a given chain, and the router merges these into a unified list. The TokenSelector component fetches tokens dynamically when the selected chain changes, with caching to avoid redundant API calls and a fallback to the hardcoded stablecoin list if all fetches fail. This mirrors the aggregator pattern used by LI.FI/Jumper, where token availability is derived from the union of all integrated bridge/DEX providers.

## Glossary

- **Token_Registry**: An in-memory cache layer in `src/config/tokens.ts` that stores dynamically fetched token lists per chain, keyed by chain ID, with a time-to-live (TTL) expiration.
- **Token_Info**: A data structure representing a single token with fields: `symbol`, `name`, `decimals`, `icon`, and `addresses` (a mapping of chain ID to contract address or mint address).
- **Adapter**: A bridge adapter implementing the `IBridgeAdapter` interface in `src/services/types.ts` (CCTP, USDT0, NEAR Intents, Across, Qore Direct).
- **Router**: The aggregation layer in `src/services/router.ts` that queries all registered adapters and merges results.
- **TokenSelector**: The React dropdown component in `src/components/TokenSelector.tsx` that displays available tokens for a selected chain.
- **BridgeCard**: The main bridge UI component in `src/components/BridgeCard.tsx` that manages chain/token/amount state.
- **Hardcoded_Fallback**: The existing static `TOKENS` record in `src/config/tokens.ts` containing USDC, USDT, and USDT0 with their known contract addresses.
- **Supported_Chains**: Ethereum (1), Arbitrum (42161), Base (8453), Optimism (10), BSC (56), and Tron (195).
- **1Click_Tokens_API**: The NEAR Intents token list endpoint at the URL defined by `NEAR_INTENTS_TOKENS_URL` in `src/config/contracts.ts`.
- **EVM_Contract_Address**: A `0x`-prefixed hexadecimal address for an ERC-20 token on an EVM chain, required for token approval transactions.

## Requirements

### Requirement 1: Adapter Token Discovery Interface

**User Story:** As a developer, I want each bridge adapter to declare which tokens it supports on a given chain, so that the router can aggregate a complete token list from all providers.

#### Acceptance Criteria

1. THE `IBridgeAdapter` interface in `src/services/types.ts` SHALL include a `getSupportedTokens(chainId: number): Promise<Token_Info[]>` method.
2. WHEN `getSupportedTokens` is called on an Adapter, THE Adapter SHALL return an array of Token_Info objects representing the tokens the Adapter supports on the specified chain.
3. WHEN `getSupportedTokens` is called with a chain ID that the Adapter does not support, THE Adapter SHALL return an empty array.
4. IF an Adapter encounters a network error while fetching token data, THEN THE Adapter SHALL return an empty array rather than throwing an exception.

### Requirement 2: NEAR Intents Adapter Token Discovery

**User Story:** As a user, I want to see all tokens available through NEAR Intents on my selected chain, so that I can bridge tokens beyond USDC and USDT.

#### Acceptance Criteria

1. WHEN `getSupportedTokens` is called on the NEAR Intents Adapter, THE NEAR Intents Adapter SHALL fetch the token list from the 1Click_Tokens_API.
2. THE NEAR Intents Adapter SHALL filter the 1Click_Tokens_API response to include only tokens on Supported_Chains.
3. THE NEAR Intents Adapter SHALL map each token from the API response to a Token_Info object containing the token symbol, name, decimals, icon URL, and the contract address or mint address for the requested chain.
4. WHEN the 1Click_Tokens_API returns tokens with symbols not in the current Hardcoded_Fallback (such as ETH, WETH, BTC, ARB, SOL), THE NEAR Intents Adapter SHALL include those tokens in the returned list.
5. IF the 1Click_Tokens_API request fails, THEN THE NEAR Intents Adapter SHALL return an empty array.

### Requirement 3: CCTP Adapter Token Discovery

**User Story:** As a developer, I want the CCTP adapter to report its supported tokens, so that USDC appears in the dynamic token list for CCTP-supported chains.

#### Acceptance Criteria

1. WHEN `getSupportedTokens` is called on the CCTP Adapter with a chain ID that has a CCTP deployment, THE CCTP Adapter SHALL return a single-element array containing the USDC Token_Info with the correct EVM_Contract_Address for that chain.
2. WHEN `getSupportedTokens` is called on the CCTP Adapter with a chain ID that does not have a CCTP deployment, THE CCTP Adapter SHALL return an empty array.

### Requirement 4: USDT0 Adapter Token Discovery

**User Story:** As a developer, I want the USDT0 adapter to report its supported tokens, so that USDT and USDT0 appear in the dynamic token list for USDT0-supported chains.

#### Acceptance Criteria

1. WHEN `getSupportedTokens` is called on the USDT0 Adapter with a chain ID that has a USDT0 OFT deployment, THE USDT0 Adapter SHALL return an array containing USDT and USDT0 Token_Info objects with the correct EVM_Contract_Address for that chain.
2. WHEN `getSupportedTokens` is called on the USDT0 Adapter with a chain ID that does not have a USDT0 OFT deployment, THE USDT0 Adapter SHALL return an empty array.

### Requirement 5: Across Adapter Token Discovery

**User Story:** As a developer, I want the Across adapter to report its supported tokens, so that USDC and USDT appear in the dynamic token list for Across-supported chains.

#### Acceptance Criteria

1. WHEN `getSupportedTokens` is called on the Across Adapter with an EVM chain ID where Across has known token addresses, THE Across Adapter SHALL return an array containing USDC and USDT Token_Info objects with the correct EVM_Contract_Address for that chain.
2. WHEN `getSupportedTokens` is called on the Across Adapter with a non-EVM chain ID or a chain ID where Across has no token addresses, THE Across Adapter SHALL return an empty array.

### Requirement 6: Router Token Aggregation

**User Story:** As a user, I want to see all tokens available on my selected chain from any bridge provider, so that I have the widest selection of bridgeable assets.

#### Acceptance Criteria

1. THE Router SHALL expose a `getAllSupportedTokens(chainId: number): Promise<Token_Info[]>` function.
2. WHEN `getAllSupportedTokens` is called, THE Router SHALL call `getSupportedTokens(chainId)` on every registered Adapter in parallel.
3. THE Router SHALL merge the results from all Adapters into a single array, deduplicating tokens by symbol (case-insensitive).
4. WHEN multiple Adapters return a Token_Info with the same symbol, THE Router SHALL prefer the entry that includes an EVM_Contract_Address for the requested chain, to ensure approval transactions can be constructed.
5. THE Router SHALL sort the merged token list alphabetically by symbol.
6. IF all Adapter calls return empty arrays, THEN THE Router SHALL return the Hardcoded_Fallback tokens for the requested chain.

### Requirement 7: Token Registry Caching

**User Story:** As a user, I want token lists to load quickly without redundant API calls, so that switching chains feels responsive.

#### Acceptance Criteria

1. THE Token_Registry SHALL cache the merged token list per chain ID in memory.
2. WHEN a cached token list exists for a chain ID and the cache entry is younger than 5 minutes, THE Token_Registry SHALL return the cached list without querying Adapters.
3. WHEN a cached token list for a chain ID is older than 5 minutes, THE Token_Registry SHALL re-fetch from all Adapters and update the cache.
4. THE Token_Registry SHALL store EVM_Contract_Addresses from the Hardcoded_Fallback alongside dynamically fetched tokens, so that approval transactions use the correct contract address.
5. WHEN the application starts, THE Token_Registry SHALL retain the Hardcoded_Fallback entries as the initial cache for all Supported_Chains.

### Requirement 8: TokenSelector Dynamic Loading

**User Story:** As a user, I want the token dropdown to show all available tokens for my selected chain, including tokens discovered dynamically from adapters.

#### Acceptance Criteria

1. WHEN the selected chain changes, THE TokenSelector SHALL request the token list for the new chain from the Token_Registry.
2. WHILE the Token_Registry is fetching tokens for a chain, THE TokenSelector SHALL display a loading indicator inside the dropdown.
3. WHEN the Token_Registry returns the token list, THE TokenSelector SHALL render all returned tokens in the dropdown.
4. IF the Token_Registry returns an empty list, THEN THE TokenSelector SHALL display the Hardcoded_Fallback tokens for the selected chain.
5. WHEN a user selects a token that was discovered dynamically, THE TokenSelector SHALL pass the selected token symbol to the parent component via the `onSelect` callback.

### Requirement 9: BridgeCard Dynamic Token Integration

**User Story:** As a user, I want the bridge form to work with dynamically discovered tokens, so that I can bridge any supported token pair.

#### Acceptance Criteria

1. WHEN the user changes the "from" chain, THE BridgeCard SHALL update the "from" token selector to show tokens available on the new chain.
2. WHEN the user changes the "to" chain, THE BridgeCard SHALL update the "to" token selector to show tokens available on the new chain.
3. WHEN the user changes the "from" chain and the currently selected "from" token is not available on the new chain, THE BridgeCard SHALL reset the "from" token to USDC if available, or to the first token in the list.
4. WHEN the user changes the "to" chain and the currently selected "to" token is not available on the new chain, THE BridgeCard SHALL reset the "to" token to USDC if available, or to the first token in the list.
5. WHEN the user selects a "from" token and "to" token, THE BridgeCard SHALL pass both token symbols to the Router for quote retrieval, and the Router SHALL query all Adapters that support the selected token pair.
6. THE BridgeCard SHALL handle token decimals from the Token_Info when parsing the user's input amount, rather than assuming 6 decimals for all tokens.

### Requirement 10: EVM Contract Address Preservation

**User Story:** As a developer, I want EVM contract addresses to be available for all tokens that go through the aggregator contract, so that token approval transactions can be constructed correctly.

#### Acceptance Criteria

1. THE Token_Registry SHALL merge EVM_Contract_Addresses from the Hardcoded_Fallback into dynamically discovered Token_Info objects that share the same symbol.
2. WHEN a dynamically discovered token includes an EVM_Contract_Address for a chain, THE Token_Registry SHALL use the dynamically provided address.
3. WHEN a dynamically discovered token does not include an EVM_Contract_Address for a chain but the Hardcoded_Fallback has one, THE Token_Registry SHALL use the Hardcoded_Fallback address.
4. FOR tokens on non-EVM chains (Tron), THE Token_Registry SHALL not require an EVM_Contract_Address.

### Requirement 11: Fallback Behavior

**User Story:** As a user, I want the bridge to remain functional even when external token APIs are unavailable, so that I can always bridge stablecoins.

#### Acceptance Criteria

1. IF all Adapter `getSupportedTokens` calls fail or return empty arrays for a chain, THEN THE Token_Registry SHALL return the Hardcoded_Fallback tokens for that chain.
2. IF the 1Click_Tokens_API is unreachable, THEN THE NEAR Intents Adapter SHALL still support routing for tokens present in the Hardcoded_Fallback using the existing `FALLBACK_ASSET_IDS` map.
3. WHEN the Token_Registry falls back to the Hardcoded_Fallback, THE TokenSelector SHALL display the fallback tokens without showing an error to the user.
