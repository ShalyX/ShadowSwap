# ShadowSwap Architecture

## System diagram

```
┌─────────────┐     encrypt amount/minOut      ┌──────────────────┐
│  User / UI  │ ──────────────────────────────►│  Nox Handle GW   │
│  (Next.js)  │◄───────────────────────────────│  + TEE / KMS     │
└──────┬──────┘     decrypt (owner/auditor)    └────────┬─────────┘
       │                                                │
       │ submitIntent(handles, proofs)                  │
       ▼                                                │
┌──────────────────┐                                    │
│ ShadowIntentBook │  encrypted intents + batches        │
└────────┬─────────┘                                    │
         │ seal / markExecuted                          │
         ▼                                              │
┌──────────────────┐   unwrap / swap / wrap             │
│ShadowSwapExecutor│───────────────────────────────────►│
└────────┬─────────┘                                    │
         │                                              │
         ├─► ConfidentialWrappedToken (ERC-7984) ───────┘
         │
         └─► SimpleAMM  (or Uniswap V2 Router02 on Sepolia)
```

## Contracts

| Contract | Role |
|----------|------|
| `MockERC20` | Demo sUSD / sETH |
| `SimpleAMM` | Guaranteed liquidity + Uniswap-like API |
| `ConfidentialWrappedToken` | ERC-20 ↔ ERC-7984 via Nox |
| `ShadowIntentBook` | Encrypted intents, batch windows, auditor ACL |
| `ShadowSwapExecutor` | Settlement against public AMM + re-shield |
| `ShadowFaucet` | Testnet funding |

## User journeys

### A. Solo private swap (demo path)

1. Faucet → sUSD  
2. Approve + `wrap` → cSUSD  
3. `setOperator(executor, until)`  
4. Encrypt amountIn + minOut with `@iexec-nox/handle`  
5. `submitIntent(...)`  
6. `pullFromIntent` → `startUnwrapHeld` → **publicDecrypt** → `finalizeUnwrapForIntent`  
7. `executeSoloAfterUnwrap(...)` → receive cSETH  

Implemented in UI (`settleSolo.ts` + Swap desk step 5) and CLI (`contracts/scripts/settle-solo.ts`).

### B. Batch private swap (product path)

1. Multiple users submit intents in the same window  
2. Anyone seals after `batchWindow` (or owner anytime)  
3. Per intent: `pullFromIntent` → `startUnwrapHeld` → `publicDecrypt` → `finalizeUnwrap`  
4. `executeBatchSamePair` — one AMM swap, pro-rata confidential outputs  

UI: `BatchDesk` + `settleBatch.ts`.

## Repo layout

```
ShadowSwap/
  contracts/          Hardhat 3 + Solidity
  frontend/           Next.js app
  docs/               Privacy + architecture
  deployments/        Address books per network
  feedback.md         iExec tools feedback (required)
  README.md
```

## Networks

| Network | NoxCompute | Notes |
|---------|------------|-------|
| Ethereum Sepolia | `0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf` | Hackathon target — **built into** `@iexec-nox/handle@0.1.0-beta.13+` |
| Arbitrum Sepolia | `0xd464B198f06756a1d00be223634b85E0a731c229` | Also in Handle SDK defaults |
| Local Hardhat | `0xB9E659AFC855778060Cf0B86E349a36404b7614c` | Needs Nox hardhat plugin for full confidential ops |

### Handle SDK Sepolia defaults (`0.1.0-beta.13`)

| Field | Value |
|-------|--------|
| Gateway | `https://gateway-testnets.noxprotocol.dev` |
| Subgraph | `https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo` |

Use **exactly** `0.1.0-beta.13+`. Older handle package versions are deprecated.
