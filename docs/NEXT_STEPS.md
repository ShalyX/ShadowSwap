# Release status

## Live Sepolia deployment

Security version 4 is deployed and enabled in both deployment manifests.

- Intent book: `0x0a4c20c67775b126dd4b6c34479613771c517c44`
- Executor: `0xc5633e64da98ca9039eeb9f5661eca5653ede0d6`
- Executor runtime hash: `0x71280e3cda1dd701cab7d4311df0683c5f3b0592ebc6f7eb6725b5b4763b7c49`
- Batch window: 300 seconds
- Authorized solver: `0x709f18f797347fbb8d53fb60567892751dd14b11`
- Golden batch receipt: `0x7f3489df7a6ed2e9e035b271f574a7953c5db6a3d7867087ed5372c5c1bb74f1`
- Evidence: `evidence/golden-batch/v4/latest.json`
- Source: all deployment contracts verified on Blockscout

## Verified paths

- Faucet → approve → wrap → operator grant → encrypted intent submission
- Owner sealing of a two-intent same-pair batch
- Per-intent pull, public decryption, and unwrap finalization
- One aggregate `SimpleAMM` swap
- Pro-rata confidential output wrapping
- Duplicate unwrap requests rejected
- Direct wrapper finalization reconciled without locking principal

## Remaining production work

1. Replace the single deployer/solver key with an operationally separate solver and a multisig owner.
2. Add a timelock for solver, adapter, intent-book, asset-pair, and rescue administration.
3. Commission an external contract audit before handling real assets.
4. Replace demo assets and `SimpleAMM` only after a separate production adapter review.

## Operator commands

```bash
cd contracts
npm test
npm run verify:deployment
npm run deploy:sepolia
node --import tsx scripts/golden-batch.ts
```

The golden-batch script refuses non-v4 manifests, non-empty target batches, expired or mixed-pair intents, zero min-outs, changed pre-seal membership, and repeat execution against an existing evidence file.
