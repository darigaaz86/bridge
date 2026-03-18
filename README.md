# QoreBridge v2

Cross-chain stablecoin bridge aggregator for USDC and USDT. Routes through Circle CCTP, USDT0 (LayerZero), and NEAR Intents — picks the best rate automatically.

Built for [Qore3](https://www.qore3.com).

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────┐
│  Static Bridge   │     │   Go Indexer +   │     │  Postgres  │
│   UI (Next.js)   │     │  Admin Dashboard │────▶│            │
│   Port 3000      │     │   Port 8080      │     │  Port 5432 │
└────────┬─────────┘     └────────┬─────────┘     └────────────┘
         │                        │
         │  web3 calls            │  listens for events
         ▼                        ▼
┌──────────────────────────────────────────────────────────────┐
│              QoreBridgeAggregator (per chain)                │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │CctpProvider│  │Usdt0Provider │  │NearIntentsProvider   │ │
│  └────────────┘  └──────────────┘  └──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- **Bridge UI** — Static Next.js app. Pure web3, no backend calls. Tracks bridge status via Circle Iris / LZ Scan / NEAR 1Click APIs directly. History in localStorage.
- **Indexer** — Go service that listens for `BridgeInitiated` events, polls downstream APIs for completion status, and serves an admin dashboard at `/`.
- **Contracts** — Solidity aggregator with pluggable provider pattern. Deployed via CREATE2 for deterministic addresses across chains.

## Prerequisites

- Node.js 18+ and npm
- Go 1.25+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)
- Docker & Docker Compose
- Funded deployer wallet on target chains

## Quick Start (Local Dev)

```bash
# 1. Install frontend deps
npm install

# 2. Start local Anvil chain + deploy contracts with mocks
cd contracts
anvil &
forge script script/TestLocalDeploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast -vvvv

# 3. Start Postgres
docker compose up db -d

# 4. Run indexer (separate terminal)
cd indexer
export DATABASE_URL="postgres://qorebridge:changeme@localhost:5432/qorebridge?sslmode=disable"
export CHAINS='[{"chainId":31337,"rpcUrl":"http://127.0.0.1:8545","aggregatorAddress":"<DEPLOYED_ADDRESS>","startBlock":0}]'
go run ./cmd/indexer/

# 5. Run frontend (separate terminal)
npm run dev
```

---

## Deployment

### Phase 1: Smart Contracts

Contracts are deployed per chain using Foundry's CREATE2 deployer. Same salt + same constructor args = same aggregator address on every chain.

#### 1. Create environment file

```bash
cp contracts/.env.testnet.example contracts/.env.mainnet
```

Edit `contracts/.env.mainnet`:

```env
DEPLOYER_PRIVATE_KEY=0x...          # Fresh wallet, funded with gas on each chain
OWNER_ADDRESS=0x...                 # Multisig (Gnosis Safe) recommended
TREASURY_ADDRESS=0x...              # Multisig for fee collection
FEE_BPS=5                           # 0.05% platform fee
MAX_FEE_BPS=100                     # 1% max (adjustable up to 5% absolute ceiling)
DEPLOY_SALT=0x...                   # Same across all chains

# Chain-specific (set per chain, 0x0 to skip a provider)
TOKEN_MESSENGER_V2=0x...            # Circle CCTP TokenMessengerV2
USDC_ADDRESS=0x...                  # Native USDC on this chain
OFT_CONTRACT=0x...                  # USDT0 LayerZero OFT contract
```

#### 2. Deploy to each chain

```bash
source contracts/.env.mainnet

# Ethereum Mainnet
forge script script/DeployDeterministic.s.sol \
  --rpc-url https://eth.llamarpc.com \
  --broadcast --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY

# Arbitrum
forge script script/DeployDeterministic.s.sol \
  --rpc-url https://arb1.arbitrum.io/rpc \
  --broadcast --verify \
  --etherscan-api-key $ARBISCAN_API_KEY

# Repeat for Base, Optimism, Polygon, Avalanche...
```

The script deploys:
- `QoreBridgeAggregator` (CREATE2 — deterministic address)
- `CctpProvider` (if `TOKEN_MESSENGER_V2` + `USDC_ADDRESS` set)
- `Usdt0Provider` (if `OFT_CONTRACT` set)
- `NearIntentsProvider` (always)

All providers are auto-registered in the aggregator during deployment.

#### 3. Post-deploy

- Verify the aggregator address is identical on every chain
- Transfer ownership to multisig: `cast send <AGG_ADDR> "transferOwnership(address)" <MULTISIG> --rpc-url <RPC>`
- Record deployed addresses for indexer and frontend config

### Phase 2: Indexer + Database

#### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with production values:

```env
# Postgres
POSTGRES_PASSWORD=<strong-password>

# RPC endpoints (use paid RPCs for reliability)
RPC_URL_ETHEREUM=https://...
RPC_URL_ARBITRUM=https://...
RPC_URL_BASE=https://...

# Aggregator addresses (same on all chains if using CREATE2)
AGGREGATOR_ETHEREUM=0x...
AGGREGATOR_ARBITRUM=0x...
AGGREGATOR_BASE=0x...
```

#### 2. Deploy

```bash
docker compose up -d
```

This starts:
- **db** — Postgres 16 on port 5432
- **indexer** — Go service on port 8080 (admin dashboard at `/`, API at `/api/history`)
- **app** — Static bridge UI on port 3000

The indexer auto-creates tables on first run and catches up from the configured start block.

#### 3. Verify

- Admin dashboard: `http://<server>:8080/`
- Check events are being indexed and status polling is working

### Phase 3: Bridge UI

The frontend is a static Next.js export. It talks directly to the blockchain via web3 — no backend dependency.

#### Option A: Docker (included in docker-compose)

Already handled by `docker compose up -d` above. The `app` service builds and serves the static site.

#### Option B: Static hosting (Vercel, Cloudflare Pages, etc.)

```bash
# Set env vars
export NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your-wc-project-id>
export NEXT_PUBLIC_SITE_URL=https://bridge.yourdomain.com
export NEXT_PUBLIC_AGGREGATOR_ETHEREUM=0x...
export NEXT_PUBLIC_AGGREGATOR_ARBITRUM=0x...

# Build
npm run build

# Deploy the out/ folder to your static host
```

---

## Contract Architecture

```
QoreBridgeAggregator (Ownable, ReentrancyGuard, Pausable)
├── bridge()              — Route tokens through a registered provider
├── registerProvider()    — Add a new bridge provider (owner only, immutable)
├── disableProvider()     — Disable a provider (owner only, reversible)
├── enableProvider()      — Re-enable a provider
├── setFeeBps()           — Update platform fee (capped by maxFeeBps)
├── setMaxFeeBps()        — Update fee ceiling (capped by ABSOLUTE_MAX_FEE_BPS = 500 / 5%)
├── setTreasury()         — Update treasury address
├── sweepFees()           — Send accumulated fees to treasury
├── pause() / unpause()   — Emergency stop
```

Fee structure:
- `feeBps` — current fee (default 5 = 0.05%)
- `maxFeeBps` — adjustable ceiling (default 100 = 1%)
- `ABSOLUTE_MAX_FEE_BPS` — compile-time hard cap (500 = 5%, cannot be changed)

## Running Tests

```bash
cd contracts

# Run all tests
forge test

# With verbose output
forge test -vvvv

# With extended fuzzing
forge test --fuzz-runs 1000
```

44 tests covering: fee math invariants, access control, reentrancy protection, provider registry, event emission, pause/unpause, constructor edge cases, and provider-specific behavior (CCTP, USDT0, NEAR Intents).

## Security Checklist

- [ ] Owner and treasury are multisig wallets
- [ ] Deployer private key rotated after deployment
- [ ] Contract verified on block explorers
- [ ] Test bridge on each chain/provider with small amounts
- [ ] Confirm `sweepFees()` works from multisig
- [ ] Indexer dashboard shows events correctly
- [ ] Postgres has strong password and is not exposed publicly

## Supported Chains

| Chain | CCTP (USDC) | USDT0 (LayerZero) | NEAR Intents |
|-------|-------------|-------------------|--------------|
| Ethereum | ✅ | ✅ | ✅ |
| Arbitrum | ✅ | ✅ | ✅ |
| Base | ✅ | ✅ | ✅ |
| Optimism | ✅ | ✅ | ✅ |
| Polygon | ✅ | — | ✅ |
| Avalanche | ✅ | — | ✅ |
| BSC | — | ✅ | ✅ |

## License

Private. Part of the Qore3 ecosystem.
