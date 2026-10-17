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
```

## Architecture

```text
Portaldot V3 WS ──> collector ──> SQLite ──> API/dashboard/alerts
Portaldot V3 EVM ──> OpsRegistry heartbeat ──> explorer tx proof
```

Third-party dependencies and licenses are listed in `backend/requirements.txt`.

## Status

Foundation commit: RPC configuration, health checks, SQLite schema, and one-shot collector are being built incrementally.
