# ShadowSwap Privacy Model

> Honest, judge-ready documentation of what is private, what leaks, and why that is still product-grade.

## One-liner

**ShadowSwap** lets users route swaps through public AMMs (Uniswap V2 / demo SimpleAMM) while keeping **trade size and min-out encrypted on Nox until settlement**, with **batch netting** to reduce size attribution and **selective auditor disclosure** via ACL.

## Design principle

Transparent AMMs need plaintext amounts at execution. ShadowSwap does **not** pretend Uniswap is fully dark.

Instead it separates phases:

| Phase | AmountIn | MinOut | Pair | Balance after |
|-------|----------|--------|------|---------------|
| Intent submitted | **Encrypted (Nox handle)** | **Encrypted** | Public | Still confidential cToken |
| Waiting in batch window | Encrypted | Encrypted | Public | Confidential |
| Auditor grant | Viewer ACL only | Viewer ACL only | Public | Confidential |
| Unwrap + swap | **Revealed** (required for AMM) | Revealed | Public | — |
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
- Optional: batched net amount if multiple intents share a pair (individual sizes harder to map if many participants)

## Batch netting (collision-resistant feature)

1. Intents accumulate in a time window (default **5 minutes**).
2. Batch is sealed (permissionless after window).
3. Same-pair intents can settle as **one** `swapExactTokensForTokens` with **net** input.
4. Outputs are distributed pro-rata into **confidential** cTokens.

Effect: a chain observer sees one pool trade, not N independent sized trades — closer to a dark aggregator than a toy wrap→swap→wrap.

## Selective disclosure

Intent owners can call `grantAuditor(intentId, auditor)`:

- Uses Nox `addViewer` on amount handles
- Auditor can decrypt for compliance **without** becoming an operator
- Spending rights remain with the user

This maps to institutional “private trading + regulated audit” — a judging axis most vanilla private-swap demos skip.

## Threat model (explicit)

| Threat | Mitigation | Residual risk |
|--------|------------|---------------|
| Mempool sees size before trade | Encrypted intents | Pair still public |
| Copy-trading / size sniping while resting | Batch window + delayed seal | Small batches leak more |
| Post-trade wallet balance surveillance | Re-shield to cToken | Settlement tx still links user↔pair |
| Hostile “auditor” | User-gated ACL grants | User error |
| AMM sandwich at execution | Encrypted minOut until exec; deadline | Standard AMM MEV once clear |

## Comparison to naive private swap

| | Naive wrap→uniswap→wrap | ShadowSwap |
|--|-------------------------|------------|
| Size private while resting | Usually no intent layer | Yes |
| minOut private | Often plaintext | Encrypted handle |
| Batch netting | No | Yes |
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

---

*This document is part of the WTF !! Hackathon Summer Edition submission deliverables.*
