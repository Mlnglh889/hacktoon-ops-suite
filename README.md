# Portaldot Ops Suite

Portaldot Stake Hub is an operational intelligence layer for Portaldot staking: validator health, staking context, alerts, and verifiable on-chain heartbeats.

## Current target

Portaldot V3 Testnet:

- Substrate WS: `wss://test-node-v3.portaldot.dev`
- EVM RPC: `https://test-evm-rpc-v3.portaldot.dev`
- EVM chain ID: `420420777`
- Explorer: `https://node-console.portaldot.dev`

## Build evidence

This repository is the fresh Hacker House implementation. Commits are intentionally incremental so the development timeline remains auditable.

## Local setup

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
python -m backend.collector --once
uvicorn backend.api:app --reload
```

Read-only API:

- `/api/v1/overview`
- `/api/v1/validators`
- `/api/v1/validators/{address}`
- `/api/v1/eras/latest`
- `/api/v1/blocks`
- `/api/v1/balance/{ss58_address}` — read-only V3 native POT balance

OpsRegistry deployment remains intentionally blocked until testnet gas and an explicit wallet-controlled signer are available. No private key is stored in this repository.

The collector uses `Session.Validators`, `Staking.ErasStakers`, `Staking.ErasValidatorPrefs`, and `Staking.ErasRewardPoints` for the current era.

## Architecture

```text
Portaldot V3 WS ──> collector ──> SQLite ──> API/dashboard/alerts
Portaldot V3 EVM ──> OpsRegistry heartbeat ──> explorer tx proof
```

Third-party dependencies and licenses are listed in `backend/requirements.txt`.

## Status

Foundation commit: RPC configuration, health checks, SQLite schema, and one-shot collector are being built incrementally.
