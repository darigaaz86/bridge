// QoreBridge Aggregator Contract ABI (relevant functions and events only)
export const AGGREGATOR_ABI = [
  {
    name: "bridge",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "providerId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "destinationChainId", type: "uint256" },
      { name: "recipient", type: "bytes32" },
      { name: "providerData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "BridgeInitiated",
    type: "event",
    inputs: [
      { name: "nonce", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "bytes32", indexed: false },
      { name: "sourceChainId", type: "uint256", indexed: false },
      { name: "destinationChainId", type: "uint256", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "platformFee", type: "uint256", indexed: false },
      { name: "providerId", type: "bytes32", indexed: false },
      { name: "providerData", type: "bytes", indexed: false },
    ],
  },
] as const;
