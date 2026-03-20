// Package listener subscribes to BridgeInitiated events on each configured chain
// and stores them in the database. It tracks the last processed block per chain
// for crash recovery and uses confirmation depth to handle reorgs.
package listener

import (
	"context"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/aspect-build/qorebridge-indexer/db"
	"github.com/aspect-build/qorebridge-indexer/types"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	ethtypes "github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// Confirmation depths per chain. Ethereum mainnet uses 12 blocks; L2s use 1.
var confirmationDepth = map[int64]uint64{
	1:     12, // Ethereum mainnet
	42161: 1,  // Arbitrum
	8453:  1,  // Base
	10:    1,  // Optimism
	137:   1,  // Polygon
}

// defaultConfirmationDepth is used for chains not in the map above.
const defaultConfirmationDepth = 1

// bridgeInitiatedEventABI is the ABI definition for the BridgeInitiated event.
const bridgeInitiatedEventABI = `[{
	"anonymous": false,
	"inputs": [
		{"indexed": true,  "internalType": "uint256", "name": "nonce",              "type": "uint256"},
		{"indexed": true,  "internalType": "address", "name": "sender",             "type": "address"},
		{"indexed": false, "internalType": "bytes32", "name": "recipient",          "type": "bytes32"},
		{"indexed": false, "internalType": "uint256", "name": "sourceChainId",      "type": "uint256"},
		{"indexed": false, "internalType": "uint256", "name": "destinationChainId", "type": "uint256"},
		{"indexed": false, "internalType": "address", "name": "token",              "type": "address"},
		{"indexed": false, "internalType": "uint256", "name": "amount",             "type": "uint256"},
		{"indexed": false, "internalType": "uint256", "name": "platformFee",        "type": "uint256"},
		{"indexed": false, "internalType": "bytes32", "name": "providerId",         "type": "bytes32"},
		{"indexed": false, "internalType": "bytes",   "name": "providerData",       "type": "bytes"}
	],
	"name": "BridgeInitiated",
	"type": "event"
}]`

// Provider ID mapping: keccak256 hash → human-readable name.
var providerIDMap map[common.Hash]string

func init() {
	providerIDMap = map[common.Hash]string{
		crypto.Keccak256Hash([]byte("cctp")):         "cctp",
		crypto.Keccak256Hash([]byte("usdt0")):        "usdt0",
		crypto.Keccak256Hash([]byte("near-intents")): "near-intents",
	}
}

// parsedABI holds the parsed BridgeInitiated event ABI.
var parsedABI abi.ABI

// bridgeInitiatedTopic is the keccak256 topic0 for the BridgeInitiated event.
var bridgeInitiatedTopic common.Hash

func init() {
	parsed, err := abi.JSON(strings.NewReader(bridgeInitiatedEventABI))
	if err != nil {
		panic(fmt.Sprintf("failed to parse BridgeInitiated ABI: %v", err))
	}
	parsedABI = parsed
	bridgeInitiatedTopic = parsed.Events["BridgeInitiated"].ID
}

// getConfirmationDepth returns the confirmation depth for a given chain ID.
func getConfirmationDepth(chainID int64) uint64 {
	if depth, ok := confirmationDepth[chainID]; ok {
		return depth
	}
	return defaultConfirmationDepth
}

// StartListener starts a goroutine for each configured chain that polls for
// BridgeInitiated events and stores them in the database. It blocks until
// the context is cancelled.
func StartListener(ctx context.Context, store *db.DB, config types.IndexerConfig) {
	var wg sync.WaitGroup

	for _, chain := range config.Chains {
		wg.Add(1)
		go func(cc types.ChainConfig) {
			defer wg.Done()
			runChainListener(ctx, store, cc, config.PollInterval)
		}(chain)
	}

	wg.Wait()
}

// runChainListener polls a single chain for BridgeInitiated events.
func runChainListener(ctx context.Context, store *db.DB, chain types.ChainConfig, pollInterval time.Duration) {
	if pollInterval == 0 {
		pollInterval = 10 * time.Second
	}

	client, err := ethclient.DialContext(ctx, chain.RPCURL)
	if err != nil {
		log.Printf("[chain %d] failed to connect to RPC: %v", chain.ChainID, err)
		return
	}
	defer client.Close()

	contractAddr := common.HexToAddress(chain.AggregatorAddress)
	confDepth := getConfirmationDepth(chain.ChainID)

	// Determine the starting block: resume from last processed block or use config start block.
	fromBlock, err := store.GetLastBlock(chain.ChainID)
	if err != nil {
		log.Printf("[chain %d] failed to get last block: %v", chain.ChainID, err)
		return
	}
	if fromBlock == 0 {
		fromBlock = chain.StartBlock
	} else {
		// Resume from the next block after the last processed one.
		fromBlock++
	}

	log.Printf("[chain %d] starting listener from block %d (confirmation depth: %d)", chain.ChainID, fromBlock, confDepth)

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[chain %d] listener stopped", chain.ChainID)
			return
		case <-ticker.C:
			if err := pollEvents(ctx, client, store, chain.ChainID, contractAddr, &fromBlock, confDepth); err != nil {
				log.Printf("[chain %d] poll error: %v", chain.ChainID, err)
			}
		}
	}
}

// maxBlockRange is the maximum number of blocks to query in a single eth_getLogs call.
// Public RPCs (e.g. Base) often limit this to 10,000 blocks.
const maxBlockRange = 5000

// pollEvents fetches new BridgeInitiated logs from the chain and stores them.
func pollEvents(
	ctx context.Context,
	client *ethclient.Client,
	store *db.DB,
	chainID int64,
	contractAddr common.Address,
	fromBlock *int64,
	confDepth uint64,
) error {
	// Get the latest block number.
	latestHeader, err := client.HeaderByNumber(ctx, nil)
	if err != nil {
		return fmt.Errorf("get latest block: %w", err)
	}
	latestBlock := latestHeader.Number.Uint64()

	// Apply confirmation depth: only process blocks that are confirmed.
	if latestBlock < confDepth {
		return nil
	}
	confirmedBlock := latestBlock - confDepth

	if int64(confirmedBlock) < *fromBlock {
		return nil // No new confirmed blocks.
	}

	// Process in chunks to stay within RPC eth_getLogs block range limits.
	chunkStart := *fromBlock
	totalEvents := 0

	for chunkStart <= int64(confirmedBlock) {
		chunkEnd := chunkStart + maxBlockRange - 1
		if chunkEnd > int64(confirmedBlock) {
			chunkEnd = int64(confirmedBlock)
		}

		query := ethereum.FilterQuery{
			FromBlock: big.NewInt(chunkStart),
			ToBlock:   big.NewInt(chunkEnd),
			Addresses: []common.Address{contractAddr},
			Topics:    [][]common.Hash{{bridgeInitiatedTopic}},
		}

		logs, err := client.FilterLogs(ctx, query)
		if err != nil {
			return fmt.Errorf("filter logs: %w", err)
		}

		for i := range logs {
			if err := processLog(ctx, client, store, chainID, &logs[i]); err != nil {
				log.Printf("[chain %d] failed to process log in tx %s: %v", chainID, logs[i].TxHash.Hex(), err)
				continue
			}
		}

		totalEvents += len(logs)

		// Update the last processed block after each chunk.
		if err := store.SetLastBlock(chainID, chunkEnd); err != nil {
			return fmt.Errorf("set last block: %w", err)
		}

		chunkStart = chunkEnd + 1
	}

	// Update fromBlock for next poll cycle.
	*fromBlock = int64(confirmedBlock) + 1

	if totalEvents > 0 {
		log.Printf("[chain %d] processed %d events up to block %d", chainID, totalEvents, confirmedBlock)
	}

	return nil
}

// processLog parses a single BridgeInitiated log and stores it in the database.
func processLog(
	ctx context.Context,
	client *ethclient.Client,
	store *db.DB,
	chainID int64,
	vLog *ethtypes.Log,
) error {
	if len(vLog.Topics) < 3 {
		return fmt.Errorf("expected at least 3 topics, got %d", len(vLog.Topics))
	}

	// Indexed fields from topics.
	nonce := new(big.Int).SetBytes(vLog.Topics[1].Bytes())
	sender := common.BytesToAddress(vLog.Topics[2].Bytes())

	// Non-indexed fields from data.
	eventData, err := parsedABI.Events["BridgeInitiated"].Inputs.NonIndexed().Unpack(vLog.Data)
	if err != nil {
		return fmt.Errorf("unpack event data: %w", err)
	}

	// eventData order: recipient, sourceChainId, destinationChainId, token, amount, platformFee, providerId, providerData
	recipient := eventData[0].([32]byte)
	sourceChainID := eventData[1].(*big.Int)
	destinationChainID := eventData[2].(*big.Int)
	token := eventData[3].(common.Address)
	amount := eventData[4].(*big.Int)
	platformFee := eventData[5].(*big.Int)
	providerID := eventData[6].([32]byte)
	providerData := eventData[7].([]byte)

	// Map provider ID hash to human-readable name.
	providerHash := common.BytesToHash(providerID[:])
	providerName, ok := providerIDMap[providerHash]
	if !ok {
		providerName = "unknown"
		log.Printf("[chain %d] unknown provider ID: %s", chainID, providerHash.Hex())
	}

	// Get block timestamp.
	block, err := client.HeaderByNumber(ctx, big.NewInt(int64(vLog.BlockNumber)))
	if err != nil {
		return fmt.Errorf("get block header for timestamp: %w", err)
	}

	event := &types.IndexedBridgeEvent{
		Nonce:              nonce.Int64(),
		TxHash:             vLog.TxHash.Hex(),
		BlockNumber:        int64(vLog.BlockNumber),
		Timestamp:          int64(block.Time),
		ChainID:            chainID,
		Sender:             strings.ToLower(sender.Hex()),
		Recipient:          "0x" + hex.EncodeToString(recipient[:]),
		SourceChainID:      sourceChainID.Int64(),
		DestinationChainID: destinationChainID.Int64(),
		Token:              strings.ToLower(token.Hex()),
		Amount:             amount.String(),
		PlatformFee:        platformFee.String(),
		Provider:           providerName,
		ProviderData:       "0x" + hex.EncodeToString(providerData),
		Status:             "pending",
	}

	if err := store.InsertBridgeEvent(event); err != nil {
		// Duplicate tx_hash is expected on re-index; skip silently.
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			return nil
		}
		return fmt.Errorf("insert bridge event: %w", err)
	}

	return nil
}
