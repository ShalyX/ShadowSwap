# 🌑 ShadowSwap

**The first Privacy-Preserving Intent-Based AMM Router built on iExec Nox.**

![ShadowSwap Cover](https://via.placeholder.com/1000x300.png?text=ShadowSwap+-+Dark+Forest+Protection)

**Live Demo (Sepolia):** [https://frontend-rlqpzenjm-shalyxs-projects.vercel.app](https://frontend-rlqpzenjm-shalyxs-projects.vercel.app)

---

## 🌲 The Problem: DeFi is a Dark Forest
On traditional AMMs, every detail of a trade—especially the **trade size** and **slippage tolerance**—is fully transparent before execution. This bleeds massive value to MEV bots, front-runners, and sandwich attackers.

Users are forced to choose between hiding their trades on centralized platforms or suffering worse execution on transparent chains.

## 🛡️ The Solution: ShadowSwap
ShadowSwap is a decentralized intent router that uses **Fully Homomorphic Encryption (FHE)** via the **iExec Nox Protocol** to shield the two most vulnerable parameters of a trade: `amountIn` and `minAmountOut`.

By keeping these parameters encrypted at rest, ShadowSwap enables **private, MEV-resistant trading** while still tapping into the massive liquidity of public AMMs like Uniswap. 

### How it Works
1. **Wrap & Shield**: Users wrap standard ERC20 tokens (e.g., sUSD) into confidential ERC7984 tokens (e.g., cSUSD).
2. **Encrypted Intents**: Users submit encrypted intents to the `ShadowIntentBook` smart contract. Only the token pair is public; the sizes remain FHE-encrypted Nox handles.
3. **Solver Netting**: An off-chain solver bot batches multiple intents for the same pair. Using strict Access Control logic (ACL), the solver is permitted to decrypt only the **aggregate sum** of the batch, never the individual intents.
4. **Public Execution**: The solver executes a single optimized trade on a public AMM (like Uniswap V2) using the netted amount. Individual user sizes are obfuscated by the crowd.
5. **Auto Re-Shielding**: The public output tokens (e.g., sETH) are immediately re-wrapped into confidential tokens (cSETH) by the smart contract and distributed pro-rata to the users.

At no point does the individual user's trade size or slippage enter the public mempool in plaintext. 

---

## 🏗️ Architecture

ShadowSwap consists of three core components:

### 1. Smart Contracts (Solidity)
- **ShadowIntentBook.sol**: The ledger of encrypted intents. It manages intent states, batches, and complex iExec Nox ACL permissions (allowing only the Executor to act on the handles).
- **ShadowSwapExecutor.sol**: The settlement engine. It unwraps the netted confidential tokens, performs the public swap via a `SwapAdapter`, and re-shields the outputs.
- **ISwapAdapter.sol**: Abstract interface allowing the executor to plug into any public AMM (currently supporting Uniswap V2).

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
This project was built from scratch to demonstrate the power of FHE applied to decentralized finance. By combining confidential state with public AMM liquidity, ShadowSwap proves that we don't need to rebuild Uniswap from the ground up to achieve MEV resistance and privacy—we just need to shield the intents. 
