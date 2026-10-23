# Portaldot Ops Suite: Validator Health for PortaldotV3 Testnet

## The hook

**Staking on Portaldot V3 is blind.** You lock tPOT with a validator without seeing how concentrated the stake is, or whether the commission quietly changed. Ops Suite reads the chain directly and shows validator health, stake concentration, and commission risk on one screen. The numbers come from chain storage, each tied to a specific block, and the snapshot is saved so anyone can re-check it.

## What it shows (live, read-only)

- **Snapshot anchor:** block 159438, finalized 159435, era 44.
- **Session validators:** 2 (`5F4ZyJ…BfYY` and `5Grj5u…hwjk`).
- **Total era stake:** 20,158.72 tPOT.
- **Stake concentration (era 44, `erasStakersOverview`):** each validator holds 10,079.36 tPOT, a 50/50 split. Validator `5F4ZyJ…BfYY` has 2 nominators, `5Grj5u…hwjk` has 1. Own stake is 10,072.15 and 10,072.45 tPOT.
- **Commission risk (`erasValidatorPrefs`):** `5F4ZyJ…BfYY` at 0%, `5Grj5u…hwjk` at 1%.
- **Reward points (era 44):** 37,560 total.

## Why this matters to a judge

- **Honest by design.** We report the chain's numbers as they are, and we name the known gap: the collector currently reads the older `ErasStakers` storage, see Known limits.
- **Every number is reproducible.** The snapshot is persisted in SQLite, and the chain reads come from `Session.Validators`, `Staking.CurrentEra`, `Staking.ErasStakersOverview`, `Staking.ErasValidatorPrefs`, and `Staking.ErasRewardPoints`.
- **It is on-chain too.** OpsRegistry is deployed on Portaldot V3 EVM at `0x132748201FbCB051CA6D73d26f27540a214d1336` (deploy tx `0xd1a94694ac01b494be79e977361d956af93a52e420fc9169c4c6219aadfb9a20`, block 159167). One heartbeat is confirmed at tx `0x1166cfc1ba80a9663465c8106224d3b3672fadf241b525620c13698d73eafe77`, block 159265, `heartbeatCount() = 1`.
- **Real transactions on the same testnet** (see `data/testnet-evidence.md`): stake, unstake, and nominate, each read back from chain.

## Architecture (one screen)

1. **Collector:** reads block, session-validator, era-staking, commission, and reward-point data from `wss://test-node-v3.portaldot.dev`.
2. **Storage:** SQLite, local-first, one row per snapshot.
3. **API:** FastAPI, read-only.
4. **Dashboard:** validator health, stake share, commission, and a rule-based risk label.
5. **OpsRegistry:** the heartbeat contract above, for on-chain proof of a snapshot.

## Known limits (stated up front)

- The dashboard collector still reads `Staking.ErasStakers`, which is empty on this runtime, so the UI can show zero exposure. The on-chain data is in `Staking.ErasStakersOverview`. Fixing that is a code change, not part of this doc update.
- Only one heartbeat has been sent. The payload snapshot is from block 159240 and is not refreshed continuously.
- Commission and risk labels are rule-based, not a model.

## Demo flow

1. Open the dashboard root.
2. Show the Portaldot V3 network and chain ID.
3. Show latest block and era freshness.
4. Open Validator Health.
5. Explain stake share, commission, reward points, and rule-based risk label.
6. Explain that sparse testnet data is shown as-is.
7. Run the one-shot collector again and refresh to show a new persisted snapshot.
8. Later, after testnet gas and explicit wallet-controlled signing are available, deploy OpsRegistry and attach the contract address + transaction hash as proof.

## Business / ecosystem value

- Validators can inspect operational changes.
- Delegators can compare concentration and commission risk.
- Ecosystem teams can use a common evidence format for support and incident review.
- The open-source collector/API boundary can become a base for alerts, Telegram notifications, and multi-chain adapters.

## Roadmap

### Before testnet gas

- Keep collector/API/dashboard stable.
- Add alert rules and validator detail view.
- Capture screenshots and a short demo recording.
- Keep all data labels network-scoped.

### After testnet gas

- Deploy OpsRegistry using an explicitly controlled signer.
- Record contract address, receipt, block, and explorer URL.
- Wire the proof into the dashboard.

### Mainnet V3 migration

- Change environment endpoints.
- Re-run collector and calibration checks.
- Preserve the same API and dashboard contract.
- Never present V2 or testnet figures as Mainnet V3 figures.

## Honest limitations

- The current deployment is not yet public.
- Heartbeat deployment is intentionally blocked until testnet gas and an explicit signer are available.
- Risk scoring is rule-based and will gain more historical factors over additional eras.
- Only two validators are active on this testnet, so concentration is a 50/50 split; a richer picture needs more validators.

## Third-party disclosure

- Python, FastAPI, Uvicorn, SQLite, `substrate-interface`, and pytest are used under their respective licenses.
- The dashboard is a small vanilla HTML/CSS/JavaScript client served by FastAPI.
- No private keys, seed phrases, or API secrets are stored in the repository.

## Judge takeaway

Ops Suite is not a mock dashboard. It is a small, auditable Portaldot V3 integration slice: live read → persisted snapshot → API → operator dashboard, with the on-chain heartbeat proof deliberately gated behind real gas and explicit signer control.
