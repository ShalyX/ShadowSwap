# Next steps to ship (before Aug 1)

## Deployed on Sepolia ✅ (2026-07-22)

Addresses in `deployments/sepolia.json` / `frontend/src/lib/deployments.json`.

1. **Pin Handle SDK** (required — older versions deprecated):
   ```bash
   cd frontend
   npm i @iexec-nox/handle@0.1.0-beta.13
   ```
   Ethereum Sepolia is **built into** beta.13 — wallet on chainId `11155111` auto-loads gateway + subgraph + NoxCompute.  

2. Run UI: `cd frontend && npm run dev` (wallet on **Ethereum Sepolia**)

3. Demo:
   - Solo: faucet → wrap → operator → submit → **Run solo settle**
   - Batch: submit ≥2 same-pair intents → **Batch settlement** preview → seal → **Run batch settle**

4. Still join [iExec Discord](https://discord.gg/RXYHBJceMe) for support.

## E2E solo settlement — **wired**

Desk path: faucet → wrap → operator → encrypted intent → **Run solo settle**.

### On-chain steps (`ShadowSwapExecutor`)

| # | Call | What happens |
|---|------|----------------|
| 1 | `pullFromIntent(intentId)` | Operator pull of intent `amountIn` handle → executor (size still encrypted) |
| 2 | `startUnwrapHeld(intentId, cTokenIn, pulledHandle)` | Burn cToken; mark `unwrapRequestId` publicly decryptable |
| 3 | **Off-chain** `handleClient.publicDecrypt(unwrapRequestId)` | Gateway returns clear amount + `decryptionProof` |
| 4 | `finalizeUnwrapForIntent(intentId, cTokenIn, unwrapRequestId, proof)` | ERC-20 lands on executor |
| 5 | `executeSoloAfterUnwrap(...)` | Public AMM swap + `wrap` output to user as cTokenOut |

### How to run

**UI:** enter intent id → **Run solo settle** (progress log in desk).

**CLI:**
```bash
cd contracts
# after deploy + user has submitted an intent with operator set
INTENT_ID=1 MIN_OUT=0 npx hardhat run scripts/settle-solo.ts --network sepolia
```

Code: `frontend/src/lib/settleSolo.ts`, `contracts/scripts/settle-solo.ts`.

## Batch settlement UI — **wired**

`BatchDesk` + `frontend/src/lib/settleBatch.ts`:

1. Preview batch membership / same-pair cohort  
2. Optional seal  
3. Per-intent unwrap (pull → unwrap → publicDecrypt → finalize)  
4. `executeBatchSamePair` — one AMM swap, pro-rata cTokenOut  

Requires each intent owner to have set executor as operator on their cTokenIn.

## Demo video script (≤4 min)

1. 0:00 — Problem: public Uniswap leaks size  
2. 0:30 — Privacy model slide (honest)  
3. 1:00 — Live: faucet, wrap, submit encrypted intent (show explorer: no amount)  
4. 2:00 — Grant auditor, decrypt as auditor  
5. 2:40 — Settle batch/solo, show cToken out  
6. 3:20 — Architecture + Nox primitives used  
7. 3:50 — Call to action / GitHub  

## Differentiation checklist before submit

- [ ] Batch with ≥2 intents same pair (show one AMM swap)  
- [ ] Auditor path in video  
- [ ] `feedback.md` filled with real gateway notes  
- [ ] README links to live Sepolia addresses  
- [ ] X post tags `@iEx_ec`  
