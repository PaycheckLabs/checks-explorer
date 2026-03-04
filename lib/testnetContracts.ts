export const AMOY_CHAIN_ID = 80002;

// From checks/docs/deployments/amoy-pchk-erc6551.md
export const PCHK_ADDRESS = "0x4dC6db5f06DAF4716b749EAb8d8efa27BcEE1218" as const;
export const MUSD_ADDRESS = "0xa01C7368672b61AdE32FAEf6aeD5aeC1845dedb5" as const;

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
