# ShadowSwap demo narration

Public AMM orders expose size and slippage before execution. ShadowSwap moves that exposure boundary.

On the live Sepolia app, amount in and minimum out are encrypted as iExec Nox handles while an intent waits in the book. The pair and deadline remain public for routing. The size does not.

Traders wrap the input, approve the executor, and submit encrypted intents. Same-pair flow shares a batch window. The solver unwraps the aggregate public leg, makes one AMM swap, and re-shields each user’s output.

Here is the live proof. Two intents, five and seven sUSD, landed in batch seventeen. One successful Sepolia transaction moved twelve sUSD into the AMM and received 0.005718995683194033 sETH.

That output was split pro rata into two confidential Shadow ETH balances. The explorer shows the public AMM transfer, while each cSETH balance remains encrypted.

The claim is precise: pre-trade privacy, batch obfuscation, selective auditor access, and private balances after settlement. The app, contracts, privacy model, and Sepolia evidence are ready for review.
