package types

import "time"

// IndexedBridgeEvent represents a bridge event indexed from on-chain BridgeInitiated events.
type IndexedBridgeEvent struct {
	ID                 int64  `json:"id" db:"id"`
	Nonce              int64  `json:"nonce" db:"nonce"`
	TxHash             string `json:"txHash" db:"tx_hash"`
	BlockNumber        int64  `json:"blockNumber" db:"block_number"`
	Timestamp          int64  `json:"timestamp" db:"timestamp"`
	ChainID            int64  `json:"chainId" db:"chain_id"`
	Sender             string `json:"sender" db:"sender"`
	Recipient          string `json:"recipient" db:"recipient"`
	SourceChainID      int64  `json:"sourceChainId" db:"source_chain_id"`
	DestinationChainID int64  `json:"destinationChainId" db:"destination_chain_id"`
	Token              string `json:"token" db:"token"`
	Amount             string `json:"amount" db:"amount"`
	PlatformFee        string `json:"platformFee" db:"platform_fee"`
	Provider           string `json:"provider" db:"provider"`
	ProviderData       string `json:"providerData" db:"provider_data"`
	Status             string `json:"status" db:"status"`
	DestinationTxHash  string `json:"destinationTxHash,omitempty" db:"destination_tx_hash"`
	FailureMessage     string `json:"failureMessage,omitempty" db:"failure_message"`
	LastPolledAt       *int64 `json:"lastPolledAt,omitempty" db:"last_polled_at"`
}

// ChainConfig holds per-chain configuration for the indexer.
type ChainConfig struct {
	ChainID           int64  `json:"chainId"`
	RPCURL            string `json:"rpcUrl"`
	AggregatorAddress string `json:"aggregatorAddress"`
	StartBlock        int64  `json:"startBlock"`
}

// IndexerConfig holds the full indexer configuration.
type IndexerConfig struct {
	Chains             []ChainConfig `json:"chains"`
	PollInterval       time.Duration
	StatusPollInterval time.Duration
}
