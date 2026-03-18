# Implementation Plan: Aggregator Contract Bridge Architecture (v2)

## Overview

Migrate QoreBridge from a server-backed architecture to a web3-native architecture with an Aggregator Smart Contract (provider registry pattern), an Indexer Service, and a static frontend. Implementation proceeds in four phases: smart contracts, indexer service, frontend migration, and cleanup.

## Tasks

- [x] 1. Set up Foundry project and core interfaces
  - [x] 1.1 Initialize Foundry project structure
    - Create `contracts/` directory with `foundry.toml`, `remappings.txt`
    - Install OpenZeppelin contracts dependency (`forge install OpenZeppelin/openzeppelin-contracts`)
    - Create `contracts/src/interfaces/IBridgeProvider.sol` with the `executeBridge` function signature
    - _Requirements: 2.7_

  - [x] 1.2 Create mock contracts for testing
    - Create `contracts/test/mocks/MockERC20.sol` (mintable ERC20 for testing)
    - Create `contracts/test/mocks/MockTokenMessengerV2.sol` (records calls to `depositForBurnWithHook`)
    - Create `contracts/test/mocks/MockOFT.sol` (records calls to `send`, accepts msg.value)
    - _Requirements: 4.1, 5.1, 6.1_

- [ ] 2. Implement QoreBridgeAggregator contract
  - [x] 2.1 Implement aggregator core with fee collection and provider registry
    - Create `contracts/src/QoreBridgeAggregator.sol`
    - Inherit Ownable, ReentrancyGuard, Pausable from OpenZeppelin
    - Implement constructor(owner, treasury, feeBps)
    - Implement `bridge()` function: transferFrom user, retain fee, transfer to provider, call executeBridge, emit BridgeInitiated. Revert if provider is not registered or is disabled.
    - Implement `registerProvider()` with immutable ID-to-address mapping: revert with `ProviderAlreadyRegistered` if ID already exists, otherwise store address and set enabled = true
    - Implement `disableProvider()` and `enableProvider()` to toggle provider enabled status without modifying the address mapping
    - Implement `getProvider()` and `isProviderEnabled()` view functions
    - Implement `setFeeBps()` with max 100 cap, `setTreasury()` with zero-address check
    - Implement `sweepFees()` with owner-only access
    - Implement `pause()` / `unpause()`
    - Define custom errors: FeeBpsTooHigh, ZeroTreasuryAddress, ProviderNotRegistered, ProviderDisabled, ProviderAlreadyRegistered, ZeroAmount
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 7.1, 7.2, 7.3, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 2.2 Write property tests for fee calculation invariant
    - **Property 1: Fee calculation invariant**
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 2.3 Write property tests for amount forwarding invariant
    - **Property 2: Amount forwarding invariant**
    - **Validates: Requirements 3.1**

  - [ ]* 2.4 Write property tests for event emission completeness
    - **Property 3: Event emission completeness**
    - **Validates: Requirements 3.2, 7.1**

  - [ ]* 2.5 Write property tests for provider data encoding
    - **Property 4: Provider data encoding correctness**
    - **Validates: Requirements 7.2**

  - [ ]* 2.6 Write property tests for nonce monotonicity
    - **Property 5: Nonce monotonicity**
    - **Validates: Requirements 7.3**

  - [ ]* 2.7 Write property tests for admin parameter updates
    - **Property 6: Admin parameter updates**
    - **Validates: Requirements 1.3, 1.4**

  - [ ]* 2.8 Write property tests for fee cap enforcement
    - **Property 7: Fee cap enforcement**
    - **Validates: Requirements 1.5**

  - [ ]* 2.9 Write property tests for access control on sweep
    - **Property 8: Access control on sweep**
    - **Validates: Requirements 1.8**

  - [ ]* 2.10 Write property tests for sweep transfers accumulated fees
    - **Property 9: Sweep transfers accumulated fees**
    - **Validates: Requirements 1.7**

  - [ ]* 2.11 Write property tests for provider registration immutability
    - **Property 10: Provider registration immutability**
    - Fuzz provider IDs and addresses, verify getProvider returns correct address and isProviderEnabled returns true after registration
    - Verify re-registration of an existing ID reverts with ProviderAlreadyRegistered
    - Verify disableProvider sets isProviderEnabled to false but getProvider still returns original address
    - Verify enableProvider restores isProviderEnabled to true
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5**

  - [ ]* 2.12 Write property tests for unregistered or disabled provider reverts
    - **Property 11: Unregistered or disabled provider reverts**
    - Fuzz unregistered provider IDs, verify bridge reverts
    - Fuzz registered-but-disabled provider IDs, verify bridge reverts
    - **Validates: Requirements 3.3**

  - [ ]* 2.13 Write property tests for pause halts bridge operations
    - **Property 12: Pause halts all bridge operations**
    - **Validates: Requirements 14.4, 14.5**

- [x] 3. Implement Bridge Provider contracts
  - [x] 3.1 Implement CctpProvider
    - Create `contracts/src/providers/CctpProvider.sol`
    - Constructor takes tokenMessengerV2 and USDC addresses, grants max approval to tokenMessengerV2
    - Implement `executeBridge`: decode CCTP params, call `depositForBurnWithHook`
    - _Requirements: 4.1, 4.2, 13.4_

  - [x] 3.2 Implement Usdt0Provider
    - Create `contracts/src/providers/Usdt0Provider.sol`
    - Constructor takes OFT contract address
    - Implement `executeBridge`: decode OFT params, call `OFT.send{value: msg.value}`
    - _Requirements: 5.1, 5.2, 13.4_

  - [x] 3.3 Implement NearIntentsProvider
    - Create `contracts/src/providers/NearIntentsProvider.sol`
    - Implement `executeBridge`: decode deposit address, safeTransfer tokens
    - _Requirements: 6.1_

  - [ ]* 3.4 Write unit tests for each provider contract
    - Test CctpProvider with MockTokenMessengerV2: verify correct call params
    - Test Usdt0Provider with MockOFT: verify correct call params and msg.value forwarding
    - Test NearIntentsProvider: verify token transfer to deposit address
    - Test revert conditions (invalid token, zero deposit address)
    - _Requirements: 4.1, 4.2, 5.1, 5.2, 6.1_

- [x] 4. Checkpoint - Smart contracts
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create Foundry deployment script
  - [x] 5.1 Implement Deploy.s.sol
    - Create `contracts/script/Deploy.s.sol`
    - Deploy QoreBridgeAggregator with owner, treasury, feeBps
    - Deploy CctpProvider, Usdt0Provider, NearIntentsProvider with chain-specific addresses
    - Register all providers in the aggregator
    - Read chain-specific config from environment variables
    - _Requirements: 13.1, 13.2, 13.3, 13.5, 13.6_

- [x] 6. Implement Indexer Service
  - [x] 6.1 Set up indexer project structure
    - Create `indexer/` directory with `go.mod`, `go.sum`
    - Add dependencies: go-ethereum (for event listening), net/http or chi (for REST API), modernc.org/sqlite (for storage)
    - Create database schema (bridge_events, indexer_state tables)
    - _Requirements: 8.1, 8.2_

  - [x] 6.2 Implement event listener
    - Create `indexer/listener/listener.go`
    - Subscribe to BridgeInitiated logs on each configured chain using go-ethereum ethclient
    - Parse event data and store in database
    - Track last processed block per chain for crash recovery
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 6.3 Implement status poller
    - Create `indexer/poller/poller.go`
    - Query pending transactions from database
    - Poll Circle Iris API for CCTP, LayerZero Scan for USDT0, NEAR 1Click for NEAR Intents
    - Update status to "done" or "failed" based on downstream response
    - Stop polling terminal-state transactions
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 6.4 Implement REST API
    - Create `indexer/api/api.go`
    - `GET /api/history?address={addr}&limit={n}&offset={n}` — filter by sender, sort by timestamp desc, paginate
    - `GET /api/history/{txHash}` — lookup by tx hash
    - Enable CORS for all origins
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 6.5 Create indexer entry point
    - Create `indexer/cmd/indexer/main.go`
    - Wire together listener, poller, and API server
    - Load config from environment variables (RPC URLs, aggregator addresses, poll intervals)
    - _Requirements: 8.1, 9.4_

  - [ ]* 6.6 Write property tests for indexer event storage
    - **Property 13: Indexer event storage completeness**
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 6.7 Write property tests for status transition correctness
    - **Property 14: Status transition correctness**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

  - [ ]* 6.8 Write property tests for history API filtering and pagination
    - **Property 15: History API filtering and pagination**
    - **Validates: Requirements 10.1, 10.3**

  - [ ]* 6.9 Write property tests for history API lookup by txHash
    - **Property 16: History API lookup by txHash**
    - **Validates: Requirements 10.2**

- [x] 7. Checkpoint - Indexer service
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend migration - Configuration and ABI
  - [x] 8.1 Add aggregator contract configuration
    - Add `AGGREGATOR_CONTRACTS` mapping (chainId → address) to `src/config/contracts.ts`
    - Add `PROVIDER_IDS` constants (keccak256 hashes) to `src/config/contracts.ts`
    - Add `INDEXER_API_URL` env variable to `src/config/contracts.ts`
    - _Requirements: 11.4, 12.2_

  - [x] 8.2 Add aggregator ABI
    - Create `src/abi/aggregator.ts` with the `bridge()` function ABI and event ABI
    - _Requirements: 11.1_

- [x] 9. Frontend migration - Bridge transaction hook
  - [x] 9.1 Refactor useBridgeTransaction to use aggregator contract
    - Replace CCTP direct call with `aggregator.bridge(PROVIDER_IDS.cctp, ...)` encoding CCTP params
    - Replace USDT0 direct call with `aggregator.bridge(PROVIDER_IDS.usdt0, ...)` encoding OFT params
    - Replace NEAR Intents direct call with `aggregator.bridge(PROVIDER_IDS["near-intents"], ...)` encoding deposit address
    - For NEAR Intents: keep the `getExecutionQuote` call to get deposit address, then pass it to aggregator
    - Update approval spender to aggregator address for all providers
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 9.2 Update router getApprovalAddress
    - Modify `src/services/router.ts` and each adapter's `getApprovalAddress` to return the aggregator contract address for the given chain
    - _Requirements: 11.3_

- [x] 10. Frontend migration - History and server removal
  - [x] 10.1 Refactor useBridgeHistory to use indexer API
    - Replace `/api/history` fetch calls with `INDEXER_API_URL/api/history`
    - Remove POST/PATCH calls (indexer populates from on-chain events)
    - Keep localStorage as fallback cache when indexer is unavailable
    - _Requirements: 12.2_

  - [x] 10.2 Remove server-side dependencies
    - Delete `src/app/api/` directory (all API route handlers)
    - Delete `src/lib/db.ts` (PostgreSQL connection)
    - Delete `scripts/init-db.sql` (DB schema)
    - Remove `pg` from `package.json` dependencies
    - _Requirements: 12.4, 12.5_

  - [x] 10.3 Configure static export
    - Add `output: "export"` to `next.config.ts`
    - Verify build produces only static files (no Node.js server runtime)
    - Update any dynamic routes to use `generateStaticParams` or remove them
    - _Requirements: 12.1, 12.3_

- [x] 11. Update deployment configuration
  - [x] 11.1 Update docker-compose.yml
    - Remove `db` (PostgreSQL) service
    - Add `indexer` service with environment variables for RPC URLs and aggregator addresses
    - Simplify `app` service to serve static files (or remove if deploying to static host)
    - _Requirements: 12.1_

  - [x] 11.2 Update environment configuration
    - Add `NEXT_PUBLIC_INDEXER_API_URL` to `.env.example`
    - Add `NEXT_PUBLIC_AGGREGATOR_*` addresses to `.env.example`
    - Remove `DATABASE_URL` from `.env.example`
    - _Requirements: 11.4, 12.4_

- [x] 12. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using Foundry fuzz (contracts) and rapid (indexer)
- Unit tests validate specific examples and edge cases
- Smart contracts are implemented first since the indexer and frontend depend on the deployed contract ABI and addresses
