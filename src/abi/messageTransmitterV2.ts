// CCTP V2 MessageTransmitterV2 ABI (relevant functions only)
export const MESSAGE_TRANSMITTER_V2_ABI = [
  {
    name: "receiveMessage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "usedNonces",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "nonce", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
