# feedback.md — iExec / Nox tools (WTF Hackathon)

> Required deliverable. Fill/update as you build. Be specific and constructive.

## Environment

- Date: 2026-07-22
- Network: Ethereum Sepolia (11155111)
- Packages:
  - `@iexec-nox/nox-protocol-contracts` ^0.2.4
  - `@iexec-nox/nox-confidential-contracts` ^0.2.2
  - `@iexec-nox/handle` **0.1.0-beta.13** (pinned; older handle versions deprecated)
  - `@iexec-nox/nox-hardhat-plugin` (local tests, optional)
- Node: 24.x
- Tooling: Hardhat 3, Next.js, viem/wagmi

## What worked well

1. **ERC-7984 + wrapper model** maps cleanly to “private balances around a public AMM.”
2. **Handle SDK encrypt/decrypt API** is ergonomic (`encryptInput`, `decrypt`, `publicDecrypt`, `viewACL`).
3. **Nox Solidity SDK** (`add`/`sub`/`transfer`/`mint`/`burn`/`allow`/`addViewer`) is expressive enough for intent books + auditor flows without inventing crypto.
4. **Official demos** (cdefi.iex.ec, demo-ctoken) are useful UX references for wrap/transfer/selective disclosure.
5. **Contracts wizard** is a good on-ramp for generating confidential contract skeletons.
6. **`@iexec-nox/handle@0.1.0-beta.13`** ships **built-in Ethereum Sepolia** network config (gateway + NoxCompute + subgraph). Connecting a wallet on chainId `11155111` resolves endpoints automatically — huge win for hackathon builders. Release: https://github.com/iExec-Nox/nox-handle-sdk/releases/tag/v0.1.0-beta.13

## Friction / bugs

1. **Docs SPA** (`docs.noxprotocol.io`) often returns empty content when scraped; GitHub READMEs / SDK source (`networks.ts`) were more reliable for endpoints.
2. **~~Sepolia config missing in SDK~~** — fixed in `0.1.0-beta.13`. Builders on older betas will fail on Sepolia unless they override config; deprecation messaging in Discord is important.
3. **Multi-tx unwrap flow** (`unwrap` → off-chain `publicDecrypt` → `finalizeUnwrap`) is correct but heavy for UX; a relayer recipe / example would help hackathon quality. ShadowSwap wires this as a 5-step solo path (`pullFromIntent` → `startUnwrapHeld` → gateway `publicDecrypt` → `finalizeUnwrapForIntent` → `executeSoloAfterUnwrap`) with UI progress + CLI — still wish it were one meta-tx.
4. **Hardhat plugin** requires Docker + Hardhat 3; mixed HH2 tutorials elsewhere create setup confusion.
5. **encrypted type surface** currently `bool|uint16|uint256|int16|int256` — fine for amounts, but worth calling out loudly in getting-started.
6. SDK README still reads a bit Arbitrum-first in places; worth listing **both** testnets in the top “Supported networks” section.

## Feature requests

1. ~~Sepolia official gateway + subgraph endpoints in SDK defaults~~ → **done in beta.13**
2. Example: **“confidential intent → public AMM → re-shield”** reference app (ShadowSwap-shaped).
3. Helper for **batch publicDecrypt** of many handles with rate-limit guidance (gateway ~100 concurrent).
4. Frontend hook package (`useNoxHandle`) for wagmi/viem.
5. Clearer **operator + unwrap** sequence diagram for ERC20 wrappers.
6. npm deprecation notices on handle versions **&lt; 0.1.0-beta.13** so installs fail loudly.

## Integration notes (ShadowSwap)

- We treat Nox as the **private leg** and Uniswap/SimpleAMM as the **public settlement leg**.
- Privacy claims are documented in `docs/PRIVACY_MODEL.md` (no overclaiming permanent dark Uniswap).
- Auditor path uses `Nox.addViewer` via `ShadowIntentBook.grantAuditor`.

## Overall

Nox is viable for a product-shaped confidential DeFi router in a hackathon timeframe. With **handle `0.1.0-beta.13` Sepolia defaults**, the main remaining UX cost is the multi-step unwrap → publicDecrypt → settle path. Biggest remaining unlock: **one end-to-end public-AMM composition example** (intent → batch → re-shield).
