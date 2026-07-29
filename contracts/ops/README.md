# ShadowSwap solver operations

The solver is an always-on Sepolia worker. It waits for two compatible intents or the on-chain batch window, seals once, resumes partially completed unwraps from contract state, and executes one AMM transaction per compatible group.

## Runtime layout

- Release: `/opt/shadowswap-solver`
- Secrets: `/etc/shadowswap/solver.env` (`root:shadowswap`, mode `0640`)
- Unit: `/etc/systemd/system/shadowswap-solver.service`
- Service user: `shadowswap`

The environment file must define `PRIVATE_KEY` and `SEPOLIA_RPC_URL`. The signer must already be authorized by the deployed executor. Never place this file in the repository or frontend environment.

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
SOLVER_ONCE=1 node --env-file=.env --import tsx scripts/solver-bot.ts
```

The one-shot command can seal or settle eligible live intents. Use it only when live Sepolia execution is intended.
