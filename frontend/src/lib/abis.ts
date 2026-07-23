export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const faucetAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export const cTokenAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "wrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "confidentialBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "until", type: "uint48" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isOperator",
    stateMutability: "view",
    inputs: [
      { name: "holder", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "underlying",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "UnwrapRequested",
    inputs: [
      { name: "receiver", type: "address", indexed: true },
      { name: "amount", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "UnwrapFinalized",
    inputs: [
      { name: "receiver", type: "address", indexed: true },
      { name: "encryptedAmount", type: "bytes32", indexed: false },
      { name: "plaintextAmount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const intentBookAbi = [
  {
    type: "function",
    name: "submitIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cTokenIn", type: "address" },
      { name: "cTokenOut", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "encryptedAmountIn", type: "bytes32" },
      { name: "amountProof", type: "bytes" },
      { name: "encryptedMinOut", type: "bytes32" },
      { name: "minOutProof", type: "bytes" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [{ name: "intentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "cancelIntent",
    stateMutability: "nonpayable",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "grantAuditor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "auditor", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sealCurrentBatch",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "sealedId", type: "uint32" }],
  },
  {
    type: "function",
    name: "getUserIntents",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getIntent",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "cTokenIn", type: "address" },
          { name: "cTokenOut", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "bytes32" },
          { name: "minAmountOut", type: "bytes32" },
          { name: "deadline", type: "uint64" },
          { name: "createdAt", type: "uint64" },
          { name: "batchId", type: "uint32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "currentBatchId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "batchWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "amountInHandle",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "minOutHandle",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "getBatchIntentIds",
    stateMutability: "view",
    inputs: [{ name: "batchId", type: "uint32" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "batches",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint32" }],
    outputs: [
      { name: "openAt", type: "uint64" },
      { name: "sealAt", type: "uint64" },
      { name: "isSealed", type: "bool" },
      { name: "isExecuted", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "IntentSubmitted",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "batchId", type: "uint32", indexed: true },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BatchSealed",
    inputs: [
      { name: "batchId", type: "uint32", indexed: true },
      { name: "intentCount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const executorAbi = [
  {
    type: "function",
    name: "executeSoloAfterUnwrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "user", type: "address" },
      { name: "cTokenOut", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountInClear", type: "uint256" },
      { name: "minOutClear", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "executeBatchSamePair",
    stateMutability: "nonpayable",
    inputs: [
      { name: "batchId", type: "uint32" },
      { name: "intentIds", type: "uint256[]" },
      { name: "users", type: "address[]" },
      { name: "cTokenOut", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIns", type: "uint256[]" },
      { name: "minOuts", type: "uint256[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "netOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "pullConfidential",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cTokenIn", type: "address" },
      { name: "from", type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "pullFromIntent",
    stateMutability: "nonpayable",
    inputs: [{ name: "intentId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "startUnwrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cTokenIn", type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "startUnwrapHeld",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "cTokenIn", type: "address" },
      { name: "amount", type: "bytes32" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "finalizeUnwrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cTokenIn", type: "address" },
      { name: "unwrapRequestId", type: "bytes32" },
      { name: "decryptedAmountAndProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeUnwrapForIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "uint256" },
      { name: "cTokenIn", type: "address" },
      { name: "unwrapRequestId", type: "bytes32" },
      { name: "decryptedAmountAndProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "ConfidentialPulled",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "cTokenIn", type: "address", indexed: true },
      { name: "amount", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "UnwrapStarted",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "cTokenIn", type: "address", indexed: true },
      { name: "unwrapRequestId", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "UnwrapFinalized",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "cTokenIn", type: "address", indexed: true },
      { name: "unwrapRequestId", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SoloSwapExecuted",
    inputs: [
      { name: "intentId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BatchSwapExecuted",
    inputs: [
      { name: "batchId", type: "uint32", indexed: true },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "netAmountIn", type: "uint256", indexed: false },
      { name: "netAmountOut", type: "uint256", indexed: false },
      { name: "intentCount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const ammAbi = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

export const erc7984Abi = [
  ...erc20Abi,
  {
    type: "function",
    name: "wrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "until", type: "uint48" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "confidentialBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bytes32" }]
  }
] as const;

