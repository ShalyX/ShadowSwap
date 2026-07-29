# ShadowSwap solver operations

The solver is an always-on Sepolia worker. It waits for sealed compatible intents, resumes partially completed unwraps from contract state, and executes one AMM transaction per compatible group. It does not call the deployed argumentless `sealCurrentBatch()` because that function cannot bind the transaction to an expected batch ID and is unsafe under concurrent sealers.

## Runtime layout

- Release: `/opt/shadowswap-solver`
- Secrets: `/etc/shadowswap/solver.env` (`root:shadowswap`, mode `0640`)
- Unit: `/etc/systemd/system/shadowswap-solver.service`
- Service user: `shadowswap`

The environment file must define `PRIVATE_KEY` and `SEPOLIA_RPC_URL`. The signer must already be authorized by the deployed executor. Never place this file in the repository or frontend environment.

The unit must also set an explicit activation range. `SOLVER_MIN_BATCH_ID` is required and fail-closed. Use `SOLVER_MAX_BATCH_ID` during staged rollout so the first live run can touch only the reviewed batch. Remove or advance the maximum only after that batch is verified.

## Operations

```bash
systemctl status shadowswap-solver --no-pager
journalctl -u shadowswap-solver -f
systemctl restart shadowswap-solver
systemctl stop shadowswap-solver
```

## Expected blocked state

`Intent #N is waiting for its user to renew the executor operator grant` is fail-closed. The user who submitted that intent must call `setOperator(executor, until)` on its confidential input token. The solver must not attempt to bypass or manufacture this user authorization.

## Release verification

Run the contract suite before copying a release:

```bash
npm test
npm audit --audit-level=high --omit=dev
SOLVER_MIN_BATCH_ID=7 SOLVER_MAX_BATCH_ID=7 SOLVER_DISCOVERY_ONLY=1 node --env-file=.env --import tsx scripts/solver-bot.ts
```

The discovery command is read-only and must print exactly the reviewed candidate IDs. Start the service only after that manifest is correct. A deterministic slippage failure exits with status `78`; systemd must not restart that status until an operator has chosen settlement recovery or a user-authorized refund.
