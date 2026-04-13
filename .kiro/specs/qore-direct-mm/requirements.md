# Requirements Document

## Introduction

Qore Direct Market Making (qore-direct-mm) adds a new bridge route that lets users swap Base USDC for Arbitrum USDC through a company-operated direct fill mechanism. A user deposits Base USDC into the existing QoreBridgeAggregator contract on Base (via a new QoreDirectProvider), and an off-chain solver bot detects the deposit event and sends Arb USDC directly from the company's Treasury_Wallet (a regular EOA on Arbitrum) to the user's destination address via a standard ERC20 transfer. The company does not deposit or lock any funds into a contract on Arbitrum — the Treasury_Wallet is simply an EOA whose private key is held by the Solver_Bot. The QoreDirectProvider on Base holds the user's deposited Base USDC with per-deposit tracking and a refund mechanism: each deposit has a configurable fill deadline, and if the Solver_Bot does not mark the deposit as filled before the deadline, the original depositor can reclaim their Base USDC. The Solver_Bot calls `markFilled(nonce)` on the QoreDirectProvider after sending Arb USDC to the user, which prevents the user from refunding a filled deposit. The company can only withdraw Base USDC from deposits that have been marked as filled. This is a trust-based model (the user trusts the company will not call markFilled without actually filling), but the refund mechanism protects users against bot downtime or operational failures. The system is designed for one direction initially (Base USDC → Arb USDC) but must be extensible for future pairs.

## Glossary

- **Aggregator**: The deployed QoreBridgeAggregator contract at `0xb63d7256E75bf9c7d0f1828137F557428e594dfC` on Base that routes bridge calls to registered providers.
- **QoreDirectProvider**: A new Solidity contract on Base implementing `IBridgeProvider` that receives USDC from the Aggregator, tracks each deposit with a per-deposit record, enforces fill deadlines, and supports user refunds and owner withdrawal of filled deposits.
- **Deposit_Record**: A per-deposit struct stored in the QoreDirectProvider mapping nonce to `{depositor, amount, token, fillDeadline, filled, refunded}`.
- **Fill_Deadline**: A per-deposit timestamp calculated as `block.timestamp + fillTimeout` at deposit time. After this deadline, the depositor may reclaim their funds if the deposit has not been marked as filled.
- **fillTimeout**: A configurable duration (in seconds) set by the contract owner that determines how long the Solver_Bot has to fill a deposit before the user can refund. Default: 1800 seconds (30 minutes).
- **Solver_Bot**: A backend service (Docker container) that monitors `BridgeInitiated` events on Base and fulfills orders by sending Arb USDC from the Treasury_Wallet on Arbitrum, then calls `markFilled(nonce)` on the QoreDirectProvider.
- **Treasury_Wallet**: A regular company-controlled EOA on Arbitrum that holds Arb USDC. The Solver_Bot holds the private key and sends standard ERC20 transfers directly from this address to fill user orders. No funds are deposited or locked into any smart contract on Arbitrum.
- **Authorized_Solver**: An address authorized by the QoreDirectProvider contract owner to call `markFilled`. This is the Solver_Bot's signing address.
- **Pricing_API**: A backend HTTP endpoint that returns quotes for the Base USDC → Arb USDC route based on current Treasury_Wallet balance and a configurable spread.
- **QoreDirect_Adapter**: A frontend TypeScript module implementing `IBridgeAdapter` that integrates the Qore Direct route into the existing bridge UI and router.
- **Fill**: The act of the Solver_Bot sending a standard ERC20 transfer of Arb USDC from the Treasury_Wallet EOA to a user's address on Arbitrum, in response to a detected deposit on Base, followed by calling `markFilled(nonce)` on the QoreDirectProvider.
- **Base_USDC**: The USDC token on the Base chain (chain ID 8453).
- **Arb_USDC**: The USDC token on the Arbitrum chain (chain ID 42161).
- **Spread**: A configurable markup (in basis points) applied to quotes to cover operational costs and profit.
- **Bridge_UI**: The frontend React application that displays transaction history, status, and refund controls to the user.

## Requirements

### Requirement 1: QoreDirectProvider Contract

**User Story:** As the platform operator, I want a provider contract on Base that tracks each user deposit individually with a fill deadline and refund mechanism, so that users are protected against bot downtime and the company can only withdraw funds from filled deposits.

#### Acceptance Criteria

1. THE QoreDirectProvider SHALL implement the `IBridgeProvider` interface with an `executeBridge(address token, uint256 amount, bytes calldata data)` function.
2. WHEN the Aggregator calls `executeBridge`, THE QoreDirectProvider SHALL create a Deposit_Record for the current Aggregator nonce containing the depositor address (decoded from `data`), token address, amount, a fillDeadline of `block.timestamp + fillTimeout`, `filled: false`, and `refunded: false`.
3. THE QoreDirectProvider SHALL store Deposit_Records in a `mapping(uint256 => Deposit_Record)` keyed by the Aggregator nonce.
4. THE QoreDirectProvider SHALL expose a `setFillTimeout(uint256 newTimeout)` function restricted to the contract owner for configuring the fill deadline duration.
5. THE QoreDirectProvider SHALL expose a `setSolver(address solver)` function restricted to the contract owner for setting the Authorized_Solver address.
6. WHEN the Authorized_Solver calls `markFilled(uint256 nonce)`, THE QoreDirectProvider SHALL set the Deposit_Record's `filled` field to `true`.
7. IF an address other than the Authorized_Solver calls `markFilled`, THEN THE QoreDirectProvider SHALL revert the transaction.
8. IF `markFilled` is called for a nonce that has already been marked as filled, THEN THE QoreDirectProvider SHALL revert the transaction.
9. IF `markFilled` is called for a nonce that has already been refunded, THEN THE QoreDirectProvider SHALL revert the transaction.
10. WHEN the original depositor calls `refund(uint256 nonce)` after the Deposit_Record's fillDeadline has passed and the deposit is not filled and not already refunded, THE QoreDirectProvider SHALL transfer the deposited token amount back to the depositor and set `refunded: true`.
11. IF an address other than the original depositor calls `refund`, THEN THE QoreDirectProvider SHALL revert the transaction.
12. IF `refund` is called before the fillDeadline, THEN THE QoreDirectProvider SHALL revert the transaction.
13. IF `refund` is called for a deposit that has been marked as filled, THEN THE QoreDirectProvider SHALL revert the transaction.
14. IF `refund` is called for a deposit that has already been refunded, THEN THE QoreDirectProvider SHALL revert the transaction.
15. THE QoreDirectProvider SHALL expose a `withdrawFilled(uint256 nonce)` function restricted to the contract owner that transfers the deposited token amount from a filled Deposit_Record to the treasury address.
16. IF `withdrawFilled` is called for a nonce that has not been marked as filled, THEN THE QoreDirectProvider SHALL revert the transaction.
17. IF `withdrawFilled` is called for a nonce that has already been withdrawn, THEN THE QoreDirectProvider SHALL revert the transaction.
18. THE QoreDirectProvider SHALL emit a `DepositRecorded(uint256 indexed nonce, address indexed depositor, address token, uint256 amount, uint256 fillDeadline)` event when a new deposit is recorded.
19. THE QoreDirectProvider SHALL emit a `DepositFilled(uint256 indexed nonce)` event when a deposit is marked as filled.
20. THE QoreDirectProvider SHALL emit a `DepositRefunded(uint256 indexed nonce, address indexed depositor, uint256 amount)` event when a deposit is refunded.
21. THE QoreDirectProvider SHALL emit a `FilledWithdrawn(uint256 indexed nonce, address indexed treasury, uint256 amount)` event when a filled deposit is withdrawn by the owner.
22. THE QoreDirectProvider SHALL use the OpenZeppelin `Ownable` access control pattern with an `initialize(address owner)` function for deterministic CREATE2 deployment.
23. THE QoreDirectProvider SHALL be registered in the Aggregator's provider registry under the provider ID `keccak256("qore-direct")`.

### Requirement 2: Solver Bot Event Detection

**User Story:** As the platform operator, I want the Solver_Bot to detect user deposits on Base in real time, so that fills can be executed promptly on Arbitrum.

#### Acceptance Criteria

1. WHEN the Aggregator emits a `BridgeInitiated` event with the `qore-direct` provider ID on Base, THE Solver_Bot SHALL detect the event within 30 seconds of block confirmation.
2. THE Solver_Bot SHALL filter `BridgeInitiated` events to process only those matching the registered `qore-direct` provider ID.
3. WHEN a matching `BridgeInitiated` event is detected, THE Solver_Bot SHALL extract the recipient address, token, amount, nonce, and source transaction hash from the event.
4. IF the Solver_Bot loses its WebSocket connection to the Base RPC node, THEN THE Solver_Bot SHALL reconnect and replay missed blocks from the last processed block number.
5. THE Solver_Bot SHALL persist the last processed block number to the PostgreSQL database so that restarts resume from the correct position.

### Requirement 3: Solver Bot Fill Execution

**User Story:** As a user, I want to receive Arb USDC on Arbitrum after depositing Base USDC, so that I can complete my cross-chain transfer.

#### Acceptance Criteria

1. WHEN the Solver_Bot detects a valid `BridgeInitiated` event for the `qore-direct` provider, THE Solver_Bot SHALL send a standard ERC20 `transfer` of Arb USDC directly from the Treasury_Wallet EOA to the recipient address on Arbitrum.
2. WHEN the Arb USDC transfer to the recipient is confirmed on Arbitrum, THE Solver_Bot SHALL call `markFilled(nonce)` on the QoreDirectProvider contract on Base to prevent the user from refunding.
3. THE Solver_Bot SHALL calculate the fill amount as the deposited amount minus the platform fee minus the Spread.
4. BEFORE executing a fill, THE Solver_Bot SHALL verify that the Treasury_Wallet has sufficient Arb USDC balance to cover the fill amount.
5. IF the Treasury_Wallet has insufficient Arb USDC balance, THEN THE Solver_Bot SHALL mark the fill as `pending_insufficient_balance` and retry at a configurable interval.
6. THE Solver_Bot SHALL record each fill attempt in the PostgreSQL database with fields: nonce, source transaction hash, destination transaction hash, markFilled transaction hash, amount, status, and timestamp.
7. IF a fill transaction fails on Arbitrum, THEN THE Solver_Bot SHALL mark the fill as `failed` in the database and retry up to a configurable maximum number of attempts.
8. IF the `markFilled` transaction fails on Base, THEN THE Solver_Bot SHALL retry the `markFilled` call up to a configurable maximum number of attempts before the fill deadline expires.
9. THE Solver_Bot SHALL prevent duplicate fills by checking the nonce against existing database records before executing.

### Requirement 4: Pricing API

**User Story:** As a user, I want to see an accurate quote for the Base USDC → Arb USDC route, so that I can decide whether to use this bridge option.

#### Acceptance Criteria

1. THE Pricing_API SHALL expose an HTTP GET endpoint that accepts `fromChain`, `toChain`, `fromToken`, `toToken`, and `amount` as query parameters.
2. WHEN a valid quote request is received for the Base USDC → Arb USDC route, THE Pricing_API SHALL return a JSON response containing `outputAmount`, `spread`, `estimatedTime`, and `available` fields.
3. THE Pricing_API SHALL calculate `outputAmount` as the input amount minus the Spread (configured in basis points via environment variable).
4. WHEN the Treasury_Wallet Arb USDC balance is less than the requested amount, THE Pricing_API SHALL return `available: false` in the response.
5. THE Pricing_API SHALL query the Treasury_Wallet balance on Arbitrum and cache the result for a configurable duration (default 30 seconds).
6. IF the request specifies an unsupported route (any route other than Base USDC → Arb USDC), THEN THE Pricing_API SHALL return HTTP 400 with a descriptive error message.

### Requirement 5: Frontend QoreDirect Adapter

**User Story:** As a user, I want the Qore Direct route to appear alongside other bridge options in the UI, so that I can compare quotes and choose the best route.

#### Acceptance Criteria

1. THE QoreDirect_Adapter SHALL implement the `IBridgeAdapter` interface with `name` set to `"qore-direct"` and `displayName` set to `"Qore Direct"`.
2. WHEN `supportsRoute` is called, THE QoreDirect_Adapter SHALL return `true` only for `fromChain=8453`, `toChain=42161`, `fromToken="USDC"`, `toToken="USDC"`.
3. WHEN `getQuote` is called, THE QoreDirect_Adapter SHALL fetch a quote from the Pricing_API and return a `BridgeQuote` object with the provider set to `"qore-direct"`.
4. WHEN the Pricing_API returns `available: false`, THE QoreDirect_Adapter SHALL return `null` from `getQuote`.
5. WHEN `getApprovalAddress` is called with chain ID 8453, THE QoreDirect_Adapter SHALL return the Aggregator contract address on Base (`0xb63d7256E75bf9c7d0f1828137F557428e594dfC`).
6. WHEN `execute` is called, THE QoreDirect_Adapter SHALL encode the provider data and call the Aggregator's `bridge` function with the `qore-direct` provider ID, Base USDC token address, amount, Arbitrum destination chain ID (42161), and the recipient address encoded as bytes32.
7. THE QoreDirect_Adapter SHALL be registered in the `adapters` array in `src/services/router.ts` so the router includes Qore Direct quotes.

### Requirement 6: Frontend Router Integration

**User Story:** As a user, I want Qore Direct quotes to appear automatically when I select the Base USDC → Arb USDC route, so that I do not need to take any extra steps.

#### Acceptance Criteria

1. WHEN a user requests quotes for Base USDC → Arb USDC, THE router SHALL include the QoreDirect_Adapter in the list of queried adapters.
2. THE router SHALL sort the Qore Direct quote alongside other provider quotes by total fee (lowest first), then by estimated time.
3. THE `PROVIDER_NAMES` constant in `src/config/constants.ts` SHALL include an entry mapping `"qore-direct"` to `"Qore Direct"`.
4. THE `PROVIDER_IDS` constant in `src/config/contracts.ts` SHALL include an entry for `"qore-direct"` with the value `keccak256("qore-direct")`.

### Requirement 7: Solver Bot Fill Status Tracking

**User Story:** As a user, I want to see the status of my Qore Direct bridge transaction including refund availability, so that I know when my funds have arrived on Arbitrum or when I can reclaim them.

#### Acceptance Criteria

1. WHEN `getStatus` is called on the QoreDirect_Adapter with a source transaction hash, THE QoreDirect_Adapter SHALL query the existing indexer API for the fill status.
2. WHEN the indexer reports the fill as complete with a destination transaction hash, THE QoreDirect_Adapter SHALL return a `TransactionStatus` with `state: "done"` and the destination transaction hash.
3. WHILE the fill is pending and the fill deadline has not passed, THE QoreDirect_Adapter SHALL return a `TransactionStatus` with `state: "confirming"` and a descriptive message.
4. WHEN the fill is pending and the fill deadline has passed without the deposit being marked as filled, THE QoreDirect_Adapter SHALL return a `TransactionStatus` with `state: "failed"` and a message indicating that a refund is available.
5. IF the fill has failed after all retry attempts, THEN THE QoreDirect_Adapter SHALL return a `TransactionStatus` with `state: "failed"` and an error message.

### Requirement 8: Solver Bot Deployment

**User Story:** As the platform operator, I want the Solver_Bot to run as a Docker container alongside existing services, so that deployment and operations follow the established infrastructure pattern.

#### Acceptance Criteria

1. THE Solver_Bot SHALL be defined as a service in the project's `docker-compose.yml` file.
2. THE Solver_Bot SHALL connect to the existing PostgreSQL database service defined in `docker-compose.yml`.
3. THE Solver_Bot SHALL accept configuration via environment variables: Base RPC URL, Arbitrum RPC URL, Treasury_Wallet private key, Spread (basis points), database connection string, and retry settings.
4. WHEN the Solver_Bot starts, THE Solver_Bot SHALL run database migrations to create required tables if they do not exist.
5. THE Solver_Bot SHALL expose a health check endpoint that reports the service status and last processed block number.

### Requirement 9: Extensibility for Future Pairs

**User Story:** As the platform operator, I want the system to support adding new trading pairs in the future, so that the architecture does not need to be redesigned.

#### Acceptance Criteria

1. THE Solver_Bot SHALL read supported pairs from a configuration source (environment variable or config file) rather than hardcoding the Base USDC → Arb USDC route.
2. THE Pricing_API SHALL accept pair configuration that specifies source chain, destination chain, source token, destination token, spread, and treasury address for each supported pair.
3. THE QoreDirect_Adapter `supportsRoute` method SHALL check against a configurable list of supported pairs rather than hardcoded chain and token values.
4. THE QoreDirectProvider contract SHALL accept any ERC20 token forwarded by the Aggregator without restricting to a specific token address.

### Requirement 10: Security and Operational Safety

**User Story:** As the platform operator, I want the system to operate safely and protect funds, so that operational risks are minimized.

#### Acceptance Criteria

1. THE Solver_Bot SHALL validate that the `BridgeInitiated` event originated from the known Aggregator contract address before processing a fill.
2. THE Solver_Bot SHALL enforce a configurable maximum fill amount per transaction to limit exposure from a single order.
3. THE Solver_Bot SHALL enforce a configurable maximum total fill amount per rolling time window to limit exposure from sustained activity.
4. IF the Treasury_Wallet Arb USDC balance falls below a configurable threshold, THEN THE Solver_Bot SHALL emit a warning log and optionally pause new fills.
5. THE QoreDirectProvider `withdrawFilled` function SHALL only transfer tokens from deposits that have been marked as filled.
6. THE Pricing_API SHALL reject quote requests where the amount exceeds the configurable maximum fill amount.
7. THE Solver_Bot SHALL call `markFilled` on the QoreDirectProvider only after confirming the Arb USDC transfer to the recipient on Arbitrum, to prevent marking unfilled deposits.
8. THE QoreDirectProvider SHALL enforce that a deposit cannot be both filled and refunded, preventing double-spend of deposited funds.

### Requirement 11: Frontend Refund Flow

**User Story:** As a user, I want to see when a refund is available for my Qore Direct deposit and trigger the refund from the UI, so that I can reclaim my Base USDC if the solver did not fill my order in time.

#### Acceptance Criteria

1. WHEN a Qore Direct transaction's fill deadline has passed and the deposit has not been marked as filled, THE Bridge_UI SHALL display a "Refund Available" status indicator on the transaction.
2. WHEN the user clicks the "Refund" action on an eligible transaction, THE Bridge_UI SHALL call the `refund(nonce)` function on the QoreDirectProvider contract using the user's connected wallet.
3. WHEN the refund transaction is confirmed on Base, THE Bridge_UI SHALL update the transaction status to "Refunded" and display the refund transaction hash.
4. WHILE the fill deadline has not passed and the deposit is not filled, THE Bridge_UI SHALL display the remaining time until refund eligibility.
5. IF the user attempts to refund a deposit that has already been filled, THEN THE Bridge_UI SHALL display an informative message indicating the deposit was filled and a refund is not available.
6. THE Bridge_UI SHALL query the QoreDirectProvider contract's Deposit_Record for a given nonce to determine the deposit's `filled`, `refunded`, and `fillDeadline` fields.
