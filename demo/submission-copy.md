# ShadowSwap submission copy

## One-line description
ShadowSwap encrypts DeFi intent size and minimum output with iExec Nox, batches same-pair flow into one public AMM swap, then re-shields each user’s output.

## Short description
ShadowSwap is a privacy-preserving intent router on Ethereum Sepolia. Traders submit `amountIn` and `minAmountOut` as encrypted iExec Nox handles. The public token pair and deadline remain routable, while the sensitive parameters stay private before execution. Same-pair intents share a batch window, settle through one public AMM transaction, and receive pro-rata confidential ERC-7984 outputs. Owners can grant an auditor read access without granting spending rights.

## Live proof
A security-v4 golden run settled two intents of 5 and 7 sUSD in batch 1 through one AMM transaction. The Sepolia receipt shows 12 sUSD entering the AMM, 0.005981284399134487 sETH returning, and two confidential cSETH outputs.

- App: https://shadowswap-app.vercel.app
- Repository: https://github.com/ShalyX/ShadowSwap
- Receipt: https://eth-sepolia.blockscout.com/tx/0x7f3489df7a6ed2e9e035b271f574a7953c5db6a3d7867087ed5372c5c1bb74f1
- Intent book: `0x0a4c20c67775b126dd4b6c34479613771c517c44`
- Executor: `0xc5633e64da98ca9039eeb9f5661eca5653ede0d6`

## Claim boundary
ShadowSwap provides pre-trade parameter privacy, batch obfuscation, selective disclosure, and confidential balances after settlement. The aggregate amount becomes public when the batch touches the transparent AMM.

## X draft
Public DEX intents leak size and slippage before execution.

ShadowSwap encrypts both with @iEx_ec Nox, batches same-pair flow into one AMM swap, then re-shields each output.

Live Sepolia proof: 2 intents, 12 sUSD net input, 1 AMM transaction, 2 confidential cSETH outputs.

App: https://shadowswap-app.vercel.app
Proof: https://eth-sepolia.blockscout.com/tx/0x7f3489df7a6ed2e9e035b271f574a7953c5db6a3d7867087ed5372c5c1bb74f1
