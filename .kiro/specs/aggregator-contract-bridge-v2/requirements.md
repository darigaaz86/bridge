# Requirements Document

## Introduction

QoreBridge v2 migrates from a server-backed Next.js architecture (with PostgreSQL and API routes) to a fully web3-native architecture. The core change introduces an Aggregator Smart Contract deployed per chain that serves as the single entry point for all bridge transactions. The contract collects platform fees on-chain, forwards remaining funds to the underlying bridge protocol (CCTP, USDT0 OFT, or NEAR Intents), and emits structured events that become the source of truth for all bridge activity. A lightweight Indexer Service listens to these on-chain events and polls downstream status APIs to provide a read-only history API. The frontend becomes a pure static export with no server-side dependencies.

## Glossary

- **Aggregator_Contract**: A Solidity smart contract deployed on each supported EVM chain that acts as the single entry point for all bridge transactions, collecting platform fees and forwarding to underlying protocols.
- **Indexer_Service**: A lightweight backend service that listens to BridgeInitiated events from Aggregator_Contracts across all chains, polls downstream status APIs, and exposes a read-only REST API for bridge history.
- **Frontend**: The static-exported Next.js application that interacts with the Aggregator_Contract for bridge transactions and reads history from the Indexer_Service.
- **Treasury_Address**: The on-chain address that receives collected platform fees on each chain.
- **Platform_Fee**: A configurable fee in basis points (default 5 bps) deducted from the bridge amount before forwarding to the underlying protocol.
- **BridgeInitiated_Event**: A Solidity event emitted by the Aggregator_Contract containing all metadata about a bridge transaction (sender, recipient, chains, token, amount, fee, provider, provider-specific data).
- **CCTP**: Circle Cross-Chain Transfer Protocol for bridging USDC using TokenMessengerV2.depositForBurnWithHook.
- **USDT0_OFT**: The LayerZero Omnichain Fungible Token contract for bridging USDT/USDT0 using OFT.send().
- **NEAR_Intents**: The NEAR 1Click protocol for bridging USDC/USDT via deposit to a solver-provided address.
- **Domain_ID**: CCTP-specific chain identifier (distinct from EVM chain ID) used for cross-chain routing.
- **Endpoint_ID**: LayerZero-specific chain identifier used for OFT cross-chain messaging.

## Requirements

### Requirement 1: Aggregator Contract Fee Collection

**User Story:** As a platform operator, I want the Aggregator_Contract to collect platform fees on-chain, so that fee collection is transparent, verifiable, and does not depend on off-chain infrastructure.

#### Acceptance Criteria

1. WHEN a user initiates a bridge transaction through the Aggregator_Contract, THE Aggregator_Contract SHALL deduct the Platform_Fee from the input amount and retain the Platform_Fee within the contract balance before forwarding the remaining amount to the underlying protocol.
2. THE Aggregator_Contract SHALL calculate the Platform_Fee as `(inputAmount * feeBps) / 10000` where feeBps is a configurable parameter stored in the contract.
3. WHEN the contract owner calls the setFeeBps function, THE Aggregator_Contract SHALL update the fee basis points to the new value.
4. WHEN the contract owner calls the setTreasury function, THE Aggregator_Contract SHALL update the Treasury_Address to the new address.
5. IF the feeBps value exceeds 100 (1%), THEN THE Aggregator_Contract SHALL revert the setFeeBps transaction.
6. IF the Treasury_Address is set to the zero address, THEN THE Aggregator_Contract SHALL revert the setTreasury transaction.
7. WHEN the contract owner calls the sweepFees function with a token address, THE Aggregator_Contract SHALL transfer the entire accumulated balance of that token held by the contract to the Treasury_Address.
8. IF a non-owner account calls the sweepFees function, THEN THE Aggregator_Contract SHALL revert the transaction.

### Requirement 2: Provider Registry

**User Story:** As a platform operator, I want the Aggregator_Contract to support a registry of bridge providers with immutable ID-to-address mappings, so that new bridge protocols can be added without redeploying the Aggregator_Contract and provider addresses can never be silently swapped.

#### Acceptance Criteria

1. THE Aggregator_Contract SHALL maintain a mapping of provider identifiers (bytes32) to Bridge_Provider contract addresses, and a separate mapping of provider identifiers to an enabled/disabled boolean status.
2. WHEN the contract owner calls registerProvider with a provider identifier and a Bridge_Provider contract address, THE Aggregator_Contract SHALL store the mapping and set the provider status to enabled.
3. IF the contract owner calls registerProvider with a provider identifier that is already registered, THEN THE Aggregator_Contract SHALL revert the transaction with a ProviderAlreadyRegistered error.
4. WHEN the contract owner calls disableProvider with a registered provider identifier, THE Aggregator_Contract SHALL set the provider status to disabled without removing the address mapping.
5. WHEN the contract owner calls enableProvider with a disabled provider identifier, THE Aggregator_Contract SHALL set the provider status to enabled.
6. IF a non-owner account calls registerProvider, disableProvider, or enableProvider, THEN THE Aggregator_Contract SHALL revert the transaction.
7. THE Bridge_Provider interface SHALL define an executeBridge function that accepts a token address, amount, and provider-specific calldata, and executes the bridge operation.
8. WHEN a provider needs to be replaced (e.g., due to a bug), THE platform operator SHALL register a new provider with a new identifier (e.g., keccak256("cctp-v2")) and disable the old provider.

### Requirement 3: Generic Bridge Entry Point

**User Story:** As a user, I want a single bridge function on the Aggregator_Contract that routes to the correct provider, so that all bridge transactions follow the same flow regardless of provider.

#### Acceptance Criteria

1. WHEN a user calls the bridge function on the Aggregator_Contract with a registered provider identifier, token, amount, destination chain, recipient, and provider-specific calldata, THE Aggregator_Contract SHALL transfer the token from the user, retain the Platform_Fee in the contract, transfer the remaining amount to the Bridge_Provider contract, and call executeBridge on the Bridge_Provider with the remaining amount and provider-specific calldata.
2. WHEN the bridge call completes, THE Aggregator_Contract SHALL emit a BridgeInitiated_Event containing the nonce, sender address, recipient, source chain ID, destination chain ID, token address, input amount, Platform_Fee amount, provider identifier, and provider-specific calldata.
3. IF the provider identifier is not registered or is disabled, THEN THE Aggregator_Contract SHALL revert the bridge transaction.
4. IF the user has not approved sufficient token allowance to the Aggregator_Contract, THEN THE Aggregator_Contract SHALL revert the bridge transaction.

### Requirement 4: CCTP Bridge Provider

**User Story:** As a user, I want to bridge USDC via CCTP through the Aggregator_Contract, so that my transaction is recorded on-chain and platform fees are collected automatically.

#### Acceptance Criteria

1. WHEN the CCTP_Provider contract's executeBridge function is called with USDC and CCTP-specific calldata (destination domain, recipient, maxFee, minFinalityThreshold, hookData), THE CCTP_Provider SHALL approve USDC to the CCTP TokenMessengerV2 and call depositForBurnWithHook with the provided parameters.
2. IF the CCTP TokenMessengerV2 address is not configured, THEN THE CCTP_Provider SHALL revert the executeBridge call.

### Requirement 5: USDT0 Bridge Provider

**User Story:** As a user, I want to bridge USDT/USDT0 via LayerZero OFT through the Aggregator_Contract, so that my transaction is recorded on-chain and platform fees are collected automatically.

#### Acceptance Criteria

1. WHEN the USDT0_Provider contract's executeBridge function is called with USDT0 and OFT-specific calldata (dstEid, recipient, minAmountLD, extraOptions, composeMsg, oftCmd) and sufficient msg.value for the LayerZero messaging fee, THE USDT0_Provider SHALL call OFT.send() with the provided parameters and forward msg.value.
2. IF the user provides insufficient msg.value for the LayerZero messaging fee, THEN THE USDT0_Provider SHALL revert the executeBridge call with a descriptive error.

### Requirement 6: NEAR Intents Bridge Provider

**User Story:** As a user, I want to bridge USDC/USDT via NEAR Intents through the Aggregator_Contract, so that my transaction is recorded on-chain and platform fees are collected automatically.

#### Acceptance Criteria

1. WHEN the NearIntents_Provider contract's executeBridge function is called with a token and NEAR Intents-specific calldata (deposit address), THE NearIntents_Provider SHALL transfer the token amount to the provided deposit address.

### Requirement 7: BridgeInitiated Event Structure

**User Story:** As an indexer operator, I want a consistent event structure emitted for every bridge transaction, so that I can reliably index all bridge activity from on-chain data.

#### Acceptance Criteria

1. THE Aggregator_Contract SHALL emit a BridgeInitiated_Event for every bridge transaction containing: sender (address), recipient (bytes32), sourceChainId (uint256), destinationChainId (uint256), token (address), amount (uint256), platformFee (uint256), provider (string), and providerData (bytes).
2. WHEN the BridgeInitiated_Event is emitted, THE providerData field SHALL encode provider-specific parameters: for CCTP the destination Domain_ID, maxFee, and minFinalityThreshold; for USDT0 the destination Endpoint_ID and nativeFee; for NEAR Intents the deposit address.
3. THE Aggregator_Contract SHALL assign a monotonically increasing nonce to each BridgeInitiated_Event on a per-contract basis.

### Requirement 8: Indexer Service Event Listening

**User Story:** As a platform operator, I want the Indexer_Service to listen to BridgeInitiated events from all deployed Aggregator_Contracts, so that bridge history can be queried without relying on the frontend or a centralized database.

#### Acceptance Criteria

1. WHEN a BridgeInitiated_Event is emitted on any supported chain, THE Indexer_Service SHALL detect the event within 30 seconds of block confirmation and store the event data.
2. THE Indexer_Service SHALL store each indexed event with: transaction hash, block number, timestamp, and all fields from the BridgeInitiated_Event.
3. WHEN the Indexer_Service restarts, THE Indexer_Service SHALL resume indexing from the last processed block number for each chain to avoid missing events.
4. IF the Indexer_Service detects a chain reorganization, THEN THE Indexer_Service SHALL re-index affected blocks and update stored event data.

### Requirement 9: Indexer Service Status Polling

**User Story:** As a user, I want to see the current status of my bridge transactions, so that I know when my funds have arrived on the destination chain.

#### Acceptance Criteria

1. WHILE a bridge transaction has a status of "pending", THE Indexer_Service SHALL poll the appropriate downstream status API: Circle Iris API for CCTP transactions, LayerZero Scan API for USDT0 transactions, and NEAR 1Click status API for NEAR Intents transactions.
2. WHEN a downstream status API reports a transaction as complete, THE Indexer_Service SHALL update the stored transaction status to "done" and record the destination transaction hash.
3. WHEN a downstream status API reports a transaction as failed or refunded, THE Indexer_Service SHALL update the stored transaction status to "failed" and record the failure reason.
4. THE Indexer_Service SHALL poll pending transactions at a configurable interval (default 10 seconds) and stop polling a transaction once its status reaches a terminal state ("done" or "failed").

### Requirement 10: Indexer Service Read-Only REST API

**User Story:** As a frontend developer, I want a read-only REST API to query bridge history by wallet address, so that the static frontend can display transaction history without server-side rendering.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/history?address={walletAddress}`, THE Indexer_Service SHALL return a JSON array of bridge history entries for that wallet address, sorted by timestamp descending.
2. WHEN a GET request is made to `/api/history/{txHash}`, THE Indexer_Service SHALL return the bridge history entry matching that source transaction hash, including the current status.
3. THE Indexer_Service SHALL support pagination via `limit` and `offset` query parameters on the history list endpoint.
4. THE Indexer_Service SHALL include CORS headers allowing requests from any origin.

### Requirement 11: Frontend Migration to Aggregator Contract

**User Story:** As a user, I want the frontend to route all bridge transactions through the Aggregator_Contract, so that my transactions are recorded on-chain and I benefit from transparent fee collection.

#### Acceptance Criteria

1. WHEN a user initiates a bridge from the Frontend, THE Frontend SHALL encode the provider-specific calldata and call the Aggregator_Contract's generic bridge function with the appropriate provider identifier, instead of calling the underlying protocol contract directly.
2. WHEN a user initiates a NEAR Intents bridge from the Frontend, THE Frontend SHALL first obtain a deposit address from the NEAR 1Click API, then encode it into the provider calldata for the bridge function.
3. WHEN the Frontend needs token approval, THE Frontend SHALL set the Aggregator_Contract address as the spender instead of the underlying protocol contract address.
4. THE Frontend SHALL read the Aggregator_Contract address for each chain from a static configuration mapping.

### Requirement 12: Frontend Static Export and Server Removal

**User Story:** As a platform operator, I want the frontend to be a pure static export with no server-side dependencies, so that it can be deployed to Cloudflare Pages, IPFS, or any static host.

#### Acceptance Criteria

1. THE Frontend SHALL be exportable as a static site using Next.js static export (output: "export") with no server-side API routes.
2. THE Frontend SHALL read bridge history from the Indexer_Service REST API instead of from server-side API routes or a direct database connection.
3. WHEN the Frontend is built, THE build process SHALL produce only static HTML, CSS, and JavaScript files with no Node.js server runtime requirement.
4. THE Frontend SHALL remove all dependencies on the pg (PostgreSQL) library and the src/lib/db.ts module.
5. THE Frontend SHALL remove the src/app/api/ directory and all server-side API route handlers.

### Requirement 13: Aggregator Contract Deployment Configuration

**User Story:** As a platform operator, I want the Aggregator_Contract deployed on each supported EVM chain with correct protocol addresses, so that bridge transactions work correctly on all chains.

#### Acceptance Criteria

1. THE Aggregator_Contract SHALL be deployable to each supported EVM chain: Ethereum, Arbitrum, Base, Optimism, Polygon, and Avalanche.
2. WHEN the Aggregator_Contract is deployed, THE deployment script SHALL configure the correct CCTP_Provider, USDT0_Provider, and NearIntents_Provider contract addresses and register them in the provider registry.
3. WHEN a Bridge_Provider contract is deployed, THE deployment script SHALL configure the correct protocol addresses (CCTP TokenMessengerV2, USDT0 OFT contract) and token addresses for that chain.
4. WHEN a Bridge_Provider contract is initialized with a protocol address, THE Bridge_Provider SHALL grant maximum (type(uint256).max) ERC20 approval to the protocol contract so that subsequent bridge calls do not require per-transaction approvals.
5. WHEN the Aggregator_Contract is deployed on a chain that does not support a specific protocol (e.g., BSC does not support CCTP), THE deployment script SHALL not register a provider for that protocol on that chain.
6. THE deployment configuration SHALL include a Hardhat or Foundry deployment script that deploys and configures the Aggregator_Contract and all Bridge_Provider contracts for each chain.

### Requirement 14: Aggregator Contract Security

**User Story:** As a platform operator, I want the Aggregator_Contract to follow security best practices, so that user funds are protected during bridge transactions.

#### Acceptance Criteria

1. THE Aggregator_Contract SHALL use OpenZeppelin's Ownable pattern for administrative functions (setFeeBps, setTreasury, setProtocolAddresses).
2. THE Aggregator_Contract SHALL use OpenZeppelin's ReentrancyGuard on all bridge functions to prevent reentrancy attacks.
3. THE Aggregator_Contract SHALL verify that token transfer amounts match expected values using SafeERC20 for all token transfers.
4. THE Aggregator_Contract SHALL include a pause mechanism (OpenZeppelin Pausable) allowing the owner to halt all bridge operations in an emergency.
5. IF a bridge function is called while the contract is paused, THEN THE Aggregator_Contract SHALL revert the transaction.
