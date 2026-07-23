# ShadowSwap

**Private AMM routing on [iExec Nox](https://github.com/iExec-Nox)** — WTF !! Hackathon Summer Edition.

> Encrypt trade size & min-out → rest in a batchable intent book → settle on a public AMM (Uniswap V2–compatible) → re-shield outputs to confidential ERC-7984 balances.

![status](https://img.shields.io/badge/chain-Ethereum%20Sepolia-blue)
![nox](https://img.shields.io/badge/privacy-Nox%20TEE%20handles-purple)
![hackathon](https://img.shields.io/badge/hackathon-WTF%20Summer%202026-orange)

## Why this wins the “private Uniswap” lane

Most teams will ship wrap → swap → wrap. ShadowSwap adds product depth:

| Feature | Detail |
|---------|--------|
| **Encrypted intents** | `amountIn` + `minAmountOut` as Nox handles |
| **Batch windows** | Default 5m seal period for same-pair netting |
| **Auditor ACL** | `grantAuditor` → Nox `addViewer` (no spend rights) |
| **Honest privacy model** | Documented leakage at settlement (`docs/PRIVACY_MODEL.md`) |
| **Guaranteed demo liquidity** | `SimpleAMM` seed + optional Uniswap V2 Router02 adapter |

## Architecture

```
User UI ──encrypt──► Nox Gateway/TEE
   │
   ├── submitIntent ► ShadowIntentBook (encrypted handles + batches)
   │
   └── settle ► ShadowSwapExecutor ► SimpleAMM / Uniswap V2
                      │
                      └── wrap out ► ConfidentialWrappedToken (cToken)
```

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [docs/PRIVACY_MODEL.md](./docs/PRIVACY_MODEL.md).

## Repo

```
ShadowSwap/
  contracts/     Hardhat 3 + Solidity (Nox + Shadow*)
  frontend/      Next.js desk UI
  docs/          Privacy + architecture
  deployments/   Address books
  feedback.md    Required iExec feedback
```

## Quick start

### Prerequisites

- Node.js ≥ 20 (24 recommended)
- Sepolia ETH
- MetaMask / injected wallet
- **`@iexec-nox/handle@0.1.0-beta.13+`** (older handle SDK versions are **deprecated**)

### Nox Handle SDK (Ethereum Sepolia built-in)

As of [`v0.1.0-beta.13`](https://github.com/iExec-Nox/nox-handle-sdk/releases/tag/v0.1.0-beta.13), connecting a wallet to **Ethereum Sepolia** auto-resolves:

| Field | Value |
|-------|--------|
| Gateway | `https://gateway-testnets.noxprotocol.dev` |
| NoxCompute | `0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf` |
| Subgraph | `https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo` |

No manual gateway env vars required for the default path. Pin the package:

```bash
cd frontend && npm i @iexec-nox/handle@0.1.0-beta.13
```

### 1. Install

```bash
cd ShadowSwap
npm run setup
# or:
cd contracts && npm install
cd ../frontend && npm install
```

### 2. Configure

```bash
# contracts
cp contracts/.env.example contracts/.env
# PRIVATE_KEY=0x...
# SEPOLIA_RPC_URL=https://...

# frontend (optional — Sepolia Nox defaults are in the SDK)
cp frontend/.env.example frontend/.env.local
# NEXT_PUBLIC_SEPOLIA_RPC=https://...
```

### 3. Deploy (Sepolia)

```bash
cd contracts
npm run deploy:sepolia
```

Writes `deployments/sepolia.json` and mirrors into `frontend/src/lib/deployments.json`.

### 4. Run UI

```bash
cd frontend
npm run dev
```

Open http://localhost:3000

### Demo flow

1. **Faucet** — mint sUSD + sETH  
2. **Wrap** — public ERC-20 → confidential cToken  
3. **Operator** — approve `ShadowSwapExecutor` on cToken  
4. **Submit encrypted intent** — size + minOut encrypted for the intent book  
5. **Run solo settle** — `pullFromIntent` → `startUnwrapHeld` → `publicDecrypt` → `finalizeUnwrap` → `executeSoloAfterUnwrap` (re-shields cTokenOut)  
6. **Optional:** grant auditor view; seal batch / batch settle  

CLI alternative after an intent exists:
```bash
cd contracts
INTENT_ID=1 npm run settle:solo
```

## Contracts

| Contract | Purpose |
|----------|---------|
| `ConfidentialWrappedToken` | ERC-20 ↔ ERC-7984 (Nox) |
| `ShadowIntentBook` | Encrypted intents, batches, auditors |
| `ShadowSwapExecutor` | Public AMM settlement + re-shield |
| `SimpleAMM` | Constant-product demo pool |
| `ShadowFaucet` | Testnet funding |

**NoxCompute (Ethereum Sepolia):** `0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF`  
**Uniswap V2 Router02 (Sepolia):** `0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3`

## Live Sepolia addresses (2026-07-22)

| Contract | Address |
|----------|---------|
| sUSD | [`0x24b5788c00ccb45ac9b4d007503615f73002cea5`](https://sepolia.etherscan.io/address/0x24b5788c00ccb45ac9b4d007503615f73002cea5) |
| sETH | [`0x7ebbd6aa42fd00de52e1cb766d8243984627a79b`](https://sepolia.etherscan.io/address/0x7ebbd6aa42fd00de52e1cb766d8243984627a79b) |
| cSUSD | [`0xf602925adc32f54b83596774c96d4ea7bf73d92b`](https://sepolia.etherscan.io/address/0xf602925adc32f54b83596774c96d4ea7bf73d92b) |
| cSETH | [`0xa83ed2d690da87d8e1131dcc532de5d41b5aa483`](https://sepolia.etherscan.io/address/0xa83ed2d690da87d8e1131dcc532de5d41b5aa483) |
| SimpleAMM | [`0x29b5aa2e5ab7a1d4bcdb6b5d805345b79719e9ed`](https://sepolia.etherscan.io/address/0x29b5aa2e5ab7a1d4bcdb6b5d805345b79719e9ed) |
| IntentBook | [`0x985f2d9fa7fbf356b22abe0dffd69b315bfc6220`](https://sepolia.etherscan.io/address/0x985f2d9fa7fbf356b22abe0dffd69b315bfc6220) |
| Executor | [`0xe281efeaa405fbbcad7082282a3f76ffab47b2b4`](https://sepolia.etherscan.io/address/0xe281efeaa405fbbcad7082282a3f76ffab47b2b4) |
| Faucet | [`0x16649904b2d9c072b244a1b7fcb9064ffa130713`](https://sepolia.etherscan.io/address/0x16649904b2d9c072b244a1b7fcb9064ffa130713) |

Also written to `deployments/sepolia.json` and `frontend/src/lib/deployments.json`.

## Deliverables checklist (hackathon)

- [x] Public product narrative + privacy honesty  
- [x] Open-source contracts + frontend  
- [x] Sepolia-oriented deploy path  
- [x] Live Sepolia addresses after deploy  
- [x] Solo + batch settlement UI  
- [x] `feedback.md` on iExec tools  
- [ ] E2E video ≤ 4 min  
- [ ] DoraHacks submit + X post tagging `@iEx_ec`

## Security notes

Hackathon code — unaudited. Do not use with mainnet funds. Operator grants and unwrap proofs must be handled carefully.

## License

MIT
