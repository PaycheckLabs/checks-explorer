export const AMOY_CHAIN_ID = 80002;

// From checks/docs/deployments/amoy-payment-checks.md (canonical deployment)
export const PAYMENT_CHECKS_ADDRESS =
  "0x9ED92dd2626E372DB3FD71Fe300f76d90aF2d589" as const;

// Back-compat alias (kept to avoid touching many imports yet)
export const PCHK_ADDRESS = PAYMENT_CHECKS_ADDRESS;

export const MUSD_ADDRESS =
  "0x0D085A1EBb74f050cE3A8ed18E3f998F04A23268" as const;

// BigInt max uint256 for approvals
export const MAX_UINT256 =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

export const PCHK_ABI = [
  {
    type: "function",
    name: "mintPaymentCheck",
    stateMutability: "nonpayable",
    inputs: [
      { name: "initialHolder", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "claimableAt", type: "uint64" },
      { name: "serial", type: "bytes32" },
      { name: "title", type: "bytes32" },
      { name: "memo", type: "string" }
    ],
    outputs: [
      { name: "checkId", type: "uint256" },
      { name: "account", type: "address" }
    ]
  }
] as const;

export const MUSD_ABI = [
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  }
] as const;
