# Portaldot Ops Suite

**Staking on Portaldot V3 is blind.** You lock tPOT with a validator without seeing how concentrated the stake is, or whether the commission quietly changed. Ops Suite reads the chain directly and shows validator health, stake concentration, and commission risk on one screen. Each number is tied to a specific block, and the snapshot is saved so anyone can re-check it.

> Portaldot Hacker House 2026 · Check-in build

## Network

| Item | Value |
|---|---|
| Substrate WS | `wss://test-node-v3.portaldot.dev` |
| EVM RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| EVM chain ID | `420420777` |
| Explorer | `https://node-console.portaldot.dev` |
| Token | tPOT (14 decimals) |

Testnet only. No mainnet data is mixed into this dashboard.

## What works now

| Feature | Status |
|---|---|
| Collector: block, session validators, era, staking (`ErasStakers`, `ErasValidatorPrefs`, `ErasRewardPoints`) | Working, one-shot run (`--once`) |
| SQLite snapshot store | Working |
| Read-only API (`/api/v1/...`) | Working, see list below |
| Validator health dashboard (`/`) | Working, served by FastAPI |
| Backend unit tests | 17 passed |
| OpsRegistry heartbeat contract | **Deployed and heartbeat confirmed** on Portaldot V3 EVM (chain 420420777): `0x132748201FbCB051CA6D73d26f27540a214d1336`, deploy tx `0xd1a94694ac01b494be79e977361d956af93a52e420fc9169c4c6219aadfb9a20`, heartbeat tx `0x1166cfc1ba80a9663465c8106224d3b3672fadf241b525620c13698d73eafe77` |

## Related work: Stake Hub

Staking actions on the same testnet were verified on-chain with a separate project, `portaldot-stake-hub`:

- Stake 1 tPOT, unstake 1 tPOT, nominate 2 validators.
- Tx hashes and blocks: [`data/testnet-evidence.md`](data/testnet-evidence.md).

## Architecture

![Architecture](docs/architecture.svg)

Two parts share one Portaldot V3 testnet and never mix data:

- **Ops Suite:** a collector reads validator, era, exposure, commission and reward-point data from chain, stores snapshots in SQLite, and serves a dashboard and API. It never signs anything.
- **Stake Hub (user-signed):** the web app lets a user **stake**, **unstake** and **nominate** (set validators, max 2). The browser builds each extrinsic and the user's own wallet extension signs it. The backend only serves a short-cached read.

Heartbeat proof is a separate EVM path: `OpsRegistry` on Portaldot V3 EVM stores heartbeat payload hashes.

```text
Portaldot V3 Substrate WS ──> collector ──> SQLite ──> API / dashboard
Stake Hub UI ──> wallet extension (user signs) ──> Portaldot V3 Substrate WS
Portaldot V3 EVM RPC ──> OpsRegistry heartbeat ──> RPC receipt proof
```

Layers:

- **Collector** (`backend/collector.py`, `collector_logic.py`): reads `Session.Validators`, `Staking.CurrentEra`, `Staking.ErasStakersOverview`, `Staking.ErasValidatorPrefs`, `Staking.ErasRewardPoints`. The legacy `ErasStakers` map is empty on this runtime, so it is no longer read.
- **Storage** (`backend/schema.sql`): SQLite, local-first.
- **API** (`backend/api.py`): FastAPI, read-only.
- **Dashboard** (`dashboard.html`): vanilla HTML/CSS/JS, served by the API at `/`.
- **Stake Hub** (`apps/web`, `backend/app`): React app for stake, unstake and nominate. Each action shows a TxToast with the extrinsic hash and explorer link. Backend caches `/network` and `/validators` for 60 s.
- **Heartbeat** (`contracts/OpsRegistry.sol`, `scripts/prepare_heartbeat.py`): contract deployed to Portaldot V3 EVM at `0x132748201FbCB051CA6D73d26f27540a214d1336` (deploy tx `0xd1a94694ac01b494be79e977361d956af93a52e420fc9169c4c6219aadfb9a20`, block 159167, status 1). Heartbeat confirmed: tx `0x1166cfc1ba80a9663465c8106224d3b3672fadf241b525620c13698d73eafe77` (block 159265, status 1, `heartbeatCount` = 1). Evidence: `data/deployment-evidence.json`.

## Run locally

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
python -m backend.collector --once      # one snapshot from V3 testnet
uvicorn backend.api:app --reload        # dashboard at http://127.0.0.1:8000
```

Run tests:

```bash
.venv/bin/python -m pytest -q
```

## API

- `GET /api/v1/health`
- `GET /api/v1/overview`
- `GET /api/v1/validators`
- `GET /api/v1/validators/{address}`
- `GET /api/v1/eras/latest`
- `GET /api/v1/blocks`
- `GET /api/v1/balance/{ss58_address}` (read-only native POT balance)
- `GET /api/v1/deployment-evidence`

## Honest limits

- Exposure comes from `ErasStakersOverview`. Eras before the snapshot window may show only the genesis self-stake (about 9,999.99 tPOT, 0 nominators), which is what the chain returns.
- Risk score is rule-based. It has no long history yet.
- OpsRegistry is deployed (`0x132748201FbCB051CA6D73d26f27540a214d1336`) and one heartbeat is confirmed (`0x1166cfc1ba80a9663465c8106224d3b3672fadf241b525620c13698d73eafe77`, block 159265). Only one heartbeat has been sent so far; the payload snapshot is from block 159240 and is not refreshed continuously.
- The payload in `data/heartbeat-payload.json` is from an older snapshot (block 71886, era 20). It must be regenerated before deployment.

## License

MIT — see [LICENSE](LICENSE). Third-party dependencies are listed in `backend/requirements.txt`.
