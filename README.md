# 🌑 ShadowSwap

**A privacy-aware intent settlement prototype built on iExec Nox.**

**Demo UI:** [https://shadowswap-app.vercel.app](https://shadowswap-app.vercel.app)
The legacy Sepolia deployment is transaction-paused in the UI until the hardened v2 contracts are redeployed.

---

## 🌲 The Problem: DeFi is a Dark Forest
On traditional AMMs, every detail of a trade—especially the **trade size** and **slippage tolerance**—is fully transparent before execution. This bleeds massive value to MEV bots, front-runners, and sandwich attackers.

Users are forced to choose between hiding their trades on centralized platforms or suffering worse execution on transparent chains.

## 🛡️ The Solution: ShadowSwap
ShadowSwap is a decentralized intent router that uses **Fully Homomorphic Encryption (FHE)** via the **iExec Nox Protocol** to shield the two most vulnerable parameters of a trade: `amountIn` and `minAmountOut`.

By keeping these parameters encrypted while an intent is resting, ShadowSwap delays size and slippage disclosure until public-AMM settlement. It does **not** guarantee protection from MEV once values are revealed for execution.

### 🌟 Key Differentiating Features
* **🛡️ Pre-settlement parameter privacy**: `amountIn` and `minAmountOut` remain encrypted while the intent waits; the UI shows exposure estimates, not guaranteed savings.
* **🏛️ User-directed auditor disclosure**: Nox viewer ACL (`Nox.addViewer`) lets an intent owner grant a specific address read access without granting spending authority.
* **🔄 Bi-Directional Swaps**: Native support for two-way confidential swaps (`sUSD ↔ sETH`).
* **📊 Market reference pricing**: CoinGecko is used for UI estimates when available; execution uses the configured on-chain venue.

### How it Works
1. **Wrap & Shield**: Users wrap standard ERC20 tokens (e.g., sUSD) into confidential ERC7984 tokens (e.g., cSUSD).
2. **Encrypted Intents**: Users submit encrypted intents to the `ShadowIntentBook` smart contract. Only the token pair is public; the sizes remain FHE-encrypted Nox handles.
3. **Authorized settlement**: A contract-authorized solver pulls and unwraps each intent. Each individual amount becomes clear during this process, so the solver and chain observers can learn it at settlement.
4. **Execution aggregation**: Same-pair intents can be combined into one pool interaction. The contract derives recipients, token addresses, and finalized input amounts from stored intents rather than trusting caller-supplied settlement data.
5. **Auto Re-Shielding**: The public output tokens (e.g., sETH) are immediately re-wrapped into confidential tokens (cSETH) by the smart contract and distributed pro-rata to the users.

The privacy boundary is explicit: inputs are private before settlement, become public for execution, and outputs return to confidential balances. Contract checks bind settlement to the submitted intent, an immutable owner-registered wrapper/underlying pair, and its proof-verified positive minimum output. Pulling moves the intent into `Settling`, which blocks cancellation; the intent owner can call `refundConfidential` before unwrap or `refundFinalized` after proof-finalization. The deployment owner remains privileged over new asset registrations, the solver allowlist, adapter, intent-book pointer, and token rescue.

---

## 🏗️ Architecture

ShadowSwap consists of three core components:

### 1. Smart Contracts (Solidity)
- **ShadowIntentBook.sol**: The ledger of encrypted intents. It manages lifecycle, batches, owner/auditor viewing, and the wrapper/executor ACL needed for settlement.
- **ShadowSwapExecutor.sol**: The authorized settlement engine. It unwraps confidential tokens, performs the public swap via a `SwapAdapter`, and re-shields outputs to intent owners.
- **ISwapAdapter.sol**: Abstract public-AMM interface. The repository deployment currently uses `SimpleAMM`, a demo constant-product venue rather than production liquidity.

### 2. Frontend (Next.js)
- A sleek, terminal-inspired dark-mode UI built with Next.js, Wagmi, and Viem.
- Integrates the `@iexec-nox/handle` SDK to encrypt inputs directly in the browser and automatically orchestrate the multi-step signature flows required for FHE operations.

### 3. Solver Bot (Node.js)
- A decentralized background worker that actively monitors the `ShadowIntentBook`.
- It dynamically batches pending intents, polls the Nox Gateway for `publicDecrypt` proofs, and submits the final settlement transaction to the blockchain.

---

## 🛠️ Built With
- **iExec Nox Protocol**: FHE Smart Contracts, ERC7984 Confidential Tokens, and Nox Gateway decryption proofs.
- **Solidity & Hardhat**: Smart contract development and deployment.
- **Next.js & React**: Frontend interface.
- **Wagmi & Viem**: Blockchain interaction and wallet connection.
- **Vercel**: Frontend hosting.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A wallet connected to **Ethereum Sepolia Testnet** with some Sepolia ETH.

### Installation

1. **Clone the repo:**
   ```bash
   git clone https://github.com/ShalyX/ShadowSwap.git
   cd ShadowSwap
   ```

2. **Run the Frontend locally:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:3000` to interact with the UI.

3. **Run the Solver Bot:**
   To settle trades on your local fork or testnet, you need to run the solver bot in a separate terminal:
   ```bash
   cd contracts
   npm install
   npm run solver
   ```
   *(Note: You will need a valid `PRIVATE_KEY` in `contracts/.env` that has Sepolia ETH to pay for settlement gas).*

---

## 💡 Hackathon Note
This project demonstrates a narrower, falsifiable claim: FHE handles can hide swap parameters while intents rest, selectively disclose them through ACLs, and bridge into a public AMM settlement that re-shields the output. Public execution and its MEV exposure remain visible limitations.
