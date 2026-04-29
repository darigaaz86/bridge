# QoreBridge Contracts

Solidity smart contracts for the QoreBridge v2 aggregator. Built with [Foundry](https://book.getfoundry.sh/).

## Contracts

| Contract | Description |
|----------|-------------|
| `QoreBridgeAggregator` | Main entry point. Handles fee deduction, provider routing, nonce tracking. Deployed via CREATE2. |
| `CctpProvider` | Routes USDC via Circle CCTP `TokenMessengerV2.depositForBurnWithHook()` |
| `Usdt0Provider` | Routes USDT0 via LayerZero `OFT.send()` |
| `NearIntentsProvider` | Routes tokens to a NEAR Intents deposit address via simple ERC20 transfer |
| `AcrossProvider` | Routes tokens via Across Protocol `SpokePool.depositV3()` |

## Build & Test

```bash
forge build
forge test -vvvv
forge test --fuzz-runs 1000   # extended fuzzing
```

## Deploy

### Testnet

```bash
cp .env.testnet.example .env.testnet
# Edit .env.testnet with your deployer key and chain-specific addresses
source .env.testnet

forge script script/DeployDeterministic.s.sol \
  --rpc-url $ETH_SEPOLIA_RPC_URL \
  --broadcast --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

### Mainnet

```bash
cp .env.testnet.example .env.mainnet
# Edit with mainnet values, multisig owner/treasury
source .env.mainnet

forge script script/DeployDeterministic.s.sol \
  --rpc-url <MAINNET_RPC> \
  --broadcast --verify \
  --etherscan-api-key <API_KEY>
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Deployer wallet private key |
| `OWNER_ADDRESS` | Contract owner (multisig recommended) |
| `TREASURY_ADDRESS` | Fee recipient (multisig recommended) |
| `FEE_BPS` | Platform fee in basis points (default: 5 = 0.05%) |
| `MAX_FEE_BPS` | Fee ceiling in basis points (default: 100 = 1%) |
| `DEPLOY_SALT` | CREATE2 salt (same across chains for deterministic address) |
| `TOKEN_MESSENGER_V2` | Circle CCTP contract (0x0 to skip) |
| `USDC_ADDRESS` | Native USDC on this chain (0x0 to skip CCTP) |
| `OFT_CONTRACT` | USDT0 LayerZero OFT contract (0x0 to skip) |

## Local Testing (Anvil)

```bash
# Terminal 1
anvil

# Terminal 2
forge script script/TestLocalDeploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast -vvvv
```

This deploys everything with mock contracts and exercises all three bridge paths end-to-end.
