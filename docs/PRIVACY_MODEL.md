# ShadowSwap Privacy Model

> Honest, judge-ready documentation of what is private, what leaks, and why that is still product-grade.

## One-liner

**ShadowSwap** routes confidential intents into a public demo AMM while keeping **trade size and min-out encrypted on Nox until settlement**, with one-call same-pair execution aggregation and **user-directed auditor disclosure** via viewer ACL.

## Design principle

Transparent AMMs need plaintext amounts at execution. ShadowSwap does **not** pretend Uniswap is fully dark.

Instead it separates phases:

| Phase | AmountIn | MinOut | Pair | Balance after |
|-------|----------|--------|------|---------------|
| Intent submitted | **Encrypted (Nox handle)** | **Encrypted** | Public | Still confidential cToken |
| Waiting in batch window | Encrypted | Encrypted | Public | Confidential |
| Auditor grant | Viewer ACL only | Viewer ACL only | Public | Confidential |
| Unwrap + swap | **Individually revealed** (required for AMM) | Individually revealed | Public | — |
| Re-wrap output | — | — | Public | **Confidential cToken out** |

## What observers see on-chain

### Always public
- User address submitting the intent
- Token pair (`tokenIn` / `tokenOut`)
- Intent id, batch id, deadlines, status transitions
- That *a* swap intent exists

### Private until execution
- Exact `amountIn`
- Exact `minAmountOut`
- User’s confidential token balances (ERC-7984 / Nox)

### Revealed at settlement
- Cleartext `amountIn` when unwrap is finalized (Nox `publicDecrypt` + `finalizeUnwrap`)
- Cleartext swap amounts on the AMM
- For a batch, every intent is unwrapped and publicly decrypted before the aggregate pool swap; batching does not hide those individual settlement amounts

## Batch execution aggregation

1. Intents accumulate in a time window (default **5 minutes**).
2. Batch is sealed (permissionless after window).
3. Same-pair intents can settle as **one** `swapExactTokensForTokens` with **net** input.
4. Outputs are distributed pro-rata into **confidential** cTokens.

Effect: the pool sees one aggregate swap instead of N pool interactions. This can reduce execution overhead and pool-level fragmentation, but it is **not an anonymity set**: per-intent public-decrypt settlement activity remains observable.

## Selective disclosure

Intent owners can call `grantAuditor(intentId, auditor)`:

- Uses Nox `addViewer` on amount handles
- Auditor can decrypt for compliance **without** becoming an operator
- Spending rights remain with the user

The grant is explicit, address-specific, and controlled by the intent owner. It is a disclosure primitive, not a compliance certification.

## Threat model (explicit)

| Threat | Mitigation | Residual risk |
|--------|------------|---------------|
| Mempool sees size before trade | Encrypted intents | Pair still public |
| Copy-trading / size sniping while resting | Encrypted amount and min-out handles | Pair, owner, timing, and deadline remain public |
| Post-trade wallet balance surveillance | Re-shield to cToken | Settlement tx still links user↔pair |
| Hostile “auditor” | User-gated ACL grants | User error |
| AMM sandwich at execution | Submitted min-out is public-decrypted with a Nox proof and enforced with the deadline | Standard AMM MEV remains once values are clear |
| Malicious settlement caller | Authorized-solver gate; recipients/tokens/amounts derived from stored intents | Owner controls solver allowlist; solver can delay settlement |
| Wrapper/token substitution | Immutable owner-registered wrapper/underlying pairs checked at submission and settlement | Owner can register additional trusted pairs |
| Interrupted multi-transaction settlement | `Settling` state blocks cancellation; user refund paths cover pre-unwrap and finalized inputs | An unwrap already started must first be publicly finalized before refund |
| Expired sealed intent | User may cancel an expired `Batched` intent until settlement starts | Timely settlement still depends on an active confidential-token operator grant |
| Compromised contract owner | Owner-only solver, adapter, intent-book, and rescue controls | v2 is admin-trusted; no timelock or multisig is enforced by the contracts |

## Comparison to naive private swap

| | Naive wrap→uniswap→wrap | ShadowSwap |
|--|-------------------------|------------|
| Size private while resting | Usually no intent layer | Yes |
| minOut private | Often plaintext | Encrypted handle |
| One-call same-pair aggregation | No | Yes |
| Auditor ACL | Rare | First-class |
| Docs honesty about leakage | Often overclaimed | Explicit |

## Nox primitives used

- `fromExternal` — admit encrypted user inputs with proofs  
- `allow` / `allowThis` / `addViewer` — ACL + auditors  
- `publicDecrypt` + wrapper `unwrap` / `finalizeUnwrap` — bridge to public AMM  
- ERC-7984 confidential balances for pre/post trade holdings  

## Non-goals (v0.1 hackathon)

- Fully encrypted Uniswap pool reserves  
- Hiding the token pair  
- Cross-chain private bridging  
- MEVless execution guarantees after cleartext swap  
- Hiding individual amounts after public-decrypt settlement

## Current deployment status

The checked-in Sepolia addresses predate the hardened executor interface. Transactional swap and batch controls remain disabled unless the deployment manifest declares `executorSecurityVersion: 2`. A new deployment must authorize the intended solver and uses the repository's `SimpleAMM` demo venue unless explicitly configured otherwise.

---

*This document is part of the WTF !! Hackathon Summer Edition submission deliverables.*
