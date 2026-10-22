# Portaldot Ops Suite — Hackathon Pitch

## One-line pitch

Portaldot Ops Suite turns raw V3 staking data into an evidence-ready operational view of validator health, stake concentration, commission risk, and network freshness.

## The problem

Portaldot staking participants need to answer basic operational questions quickly:

- Is the network snapshot fresh?
- Which validators are active?
- How much stake is concentrated in each validator?
- Is commission or concentration becoming a risk?
- Can a demo or alert be backed by a verifiable chain snapshot?

Raw chain RPC data is powerful but not an operator-friendly product.

## The solution

Ops Suite is a read-only intelligence layer:

1. A Portaldot V3 Substrate collector reads block, session-validator, era-staking, commission, and reward-point data.
2. SQLite persists snapshots for repeatable inspection and evidence.
3. FastAPI exposes a small read-only API.
4. The dashboard turns the API into a clear validator-health view.
5. An OpsRegistry heartbeat proof path is prepared for a later wallet-controlled testnet deployment.

## Why Portaldot is essential

This product is built around Portaldot V3 data structures and network identity, not generic placeholder data:

- Portaldot V3 Substrate WS: `wss://test-node-v3.portaldot.dev`
- Portaldot V3 EVM RPC: `https://test-evm-rpc-v3.portaldot.dev`
- Chain ID: `420420777`
- Collector methods include `Session.Validators`, `Staking.CurrentEra`, `Staking.ErasStakers`, `Staking.ErasValidatorPrefs`, and `Staking.ErasRewardPoints`.

The same configuration boundary allows testnet-to-mainnet-V3 migration without rewriting the product logic.

## Current verified state

- Public GitHub URL intended for submission: `https://github.com/Mlnglh889/hacktoon-ops-suite`
- Incremental commit history: 6 commits, including the dashboard commit.
- Backend unit tests: **17 passed**.
- Local API smoke test: `/`, `/api/v1/health`, `/api/v1/overview`, and `/api/v1/validators` returned HTTP 200.
- Latest live read (block 142410, era 39): 2 session validators, `ErasTotalStake` 20,141.32 tPOT.
- Per-validator exposure for the selected validators is still zero in recent eras; it is shown honestly, not as a fabricated chart.
- No mainnet data is mixed into the V3 testnet dashboard.
- Staking test-transactions on the same testnet (see `data/testnet-evidence.md`): stake 1 tPOT, unstake 1 tPOT, nominate 2 validators.

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
- A sparse testnet snapshot may have zero stake; the UI preserves that fact rather than fabricating a chart.

## Third-party disclosure

- Python, FastAPI, Uvicorn, SQLite, `substrate-interface`, and pytest are used under their respective licenses.
- The dashboard is a small vanilla HTML/CSS/JavaScript client served by FastAPI.
- No private keys, seed phrases, or API secrets are stored in the repository.

## Judge takeaway

Ops Suite is not a mock dashboard. It is a small, auditable Portaldot V3 integration slice: live read → persisted snapshot → API → operator dashboard, with the on-chain heartbeat proof deliberately gated behind real gas and explicit signer control.
