# Portaldot OPS Suite

A non-custodial operator console and staking workspace for the Portaldot V3 testnet.

Portaldot OPS Suite combines live chain observability with user-signed staking flows. It makes validator commission, exposure, nomination limits, RPC performance, network state, and staking transactions easier to inspect without taking custody of wallet keys.

> Testnet only. tPOT has no monetary value. Never enter a seed phrase or private key into this project.

## Live website

**Production app:** https://portaldotopssuite.vercel.app/

The public surface contains:

- **Home** — product overview and network proof.
- **Product** — how the operator console and user-signed staking flow work.
- **Docs** — live network reference, staking lifecycle, API reference, troubleshooting, and module guide.
- **Open Stake Hub** — the internal OPS Suite workspace.

The internal workspace currently contains:

- Overview
- Stake
- Unstake
- Portfolio
- Validators
- RPC Analyst
- Docs
- Ask AI

## What the product does

### Observe the network

The OPS Suite reads Portaldot V3 data through the API and displays:

- Current block and era
- Validator count and total stake
- Validator commission and exposure
- Nominator counts and nomination limits
- Substrate and EVM RPC probe results
- Cached/stale state when a live read is temporarily unavailable

Every live value should be traceable to a chain read, RPC measurement, configured endpoint, or an explicitly labelled cached response. The UI does not invent uptime, APY, TVL, audit claims, or risk metrics.

### Stake from the user's wallet

The browser builds staking extrinsics locally. The connected wallet extension signs them. The backend does not hold a seed phrase, private key, or signing account.

Supported flows include:

- Bond / stake tPOT
- Unbond / unstake tPOT
- Nominate up to two validators
- Review fee information before signing
- Display a transaction toast with the extrinsic hash and explorer link
- Track portfolio balances and unbonding chunks

## Network reference

| Parameter | Value |
|---|---|
| Network | Portaldot V3 Testnet |
| EVM chain ID | `420420777` |
| Native token | `tPOT` · 14 decimals |
| SS58 prefix | `42` |
| Substrate RPC (WSS) | `wss://test-node-v3.portaldot.dev` |
| Substrate RPC (HTTPS) | `https://test-node-v3.portaldot.dev` |
| EVM RPC (HTTPS) | `https://test-evm-rpc-v3.portaldot.dev` |
| Testnet explorer | `https://scanner-testnet-v3.portaldot.dev` |
| Node console | `https://node-console.portaldot.dev` |

No mainnet data is mixed into this dashboard.

## API reference

The production frontend uses these read-only API routes:

```text
GET /api/v3/overview
GET /api/v3/validators
GET /api/v3/infra/rpc?window=1h|24h|7d
GET /api/v3/network
GET /api/v3/health
GET /api/v3/incidents
```

The API responses are served through the deployment's relative `/api` path. The frontend keeps static configuration visible when a live request fails and labels stale data instead of replacing it with fake zeros.

## Repository layout

```text
backend/                 Collector, read-only API, metrics and chain helpers
contracts/               OpsRegistry contract source
scripts/                 Deployment and heartbeat preparation utilities
data/                    Testnet evidence and local snapshot data
docs/                    Architecture and development notes
tests/                   Backend and collector tests
dashboard.html           Legacy standalone dashboard surface
```

The current production visual application is maintained separately in the local `portaldot-redesign` workspace and deployed to the Vercel project behind the live URL above. The public GitHub repository remains the source for the backend, evidence, contract, and project documentation.

## Architecture

```text
Portaldot V3 Substrate RPC
        │
        ├── collector / chain reads ──> local snapshot data ──> read-only API
        │                                                        │
        │                                                        ▼
        │                                             OPS Suite frontend
        │                                      Overview / Validators / RPC Analyst
        │
        └── connected wallet extension <── browser-built extrinsic
                                                │
                                                └── user signs locally

Portaldot V3 EVM RPC ──> OpsRegistry heartbeat evidence
```

Important boundaries:

- Observability reads do not sign transactions.
- Staking transactions are signed by the user's wallet extension.
- The backend is not a custodial wallet service.
- Cached values are labelled and are not presented as fresh chain state.
- Testnet configuration and evidence must not be interpreted as mainnet readiness.

## Run locally

### Backend

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
python -m backend.collector --once
uvicorn backend.api:app --reload
```

The legacy backend dashboard/API is available at `http://127.0.0.1:8000` when started with the appropriate app entrypoint.

### Stake Hub backend and frontend

```bash
cd apps/stake-hub/backend
python -m uvicorn app.main:app --reload
```

In another terminal:

```bash
cd apps/stake-hub/apps/web
npm install
npm run dev
```

The exact local API origin may be configured by the frontend environment. Use the repository's Vite configuration and `.env` examples rather than hard-coding production credentials.

## Tests

Run the repository test suite from the root:

```bash
.venv/bin/python -m pytest
```

Run the frontend build where applicable:

```bash
cd apps/stake-hub/apps/web
npm install
npm run build
```

Do not claim a deployment, transaction, or live-chain result without checking the actual command output or on-chain evidence.

## Evidence and honest limits

- The project is a Portaldot V3 testnet build, not a mainnet product.
- Validator and exposure values reflect what the configured runtime and API return at read time.
- Risk labels are derived indicators, not an audited protocol risk model.
- RPC health is a measurement of the configured probes and can change with network conditions.
- Cached data can be stale; the UI must show its last update state.
- Wallet signing remains an explicit user action.
- Historical transaction evidence belongs in `data/testnet-evidence.md` and should be rechecked against the explorer before being cited as current.

## Security

Never commit:

- Seed phrases
- Private keys
- Wallet passwords
- API tokens
- Production credentials
- Unredacted environment files

Report a project issue at:

https://github.com/Mlnglh889/hacktoon-ops-suite/issues

## License

MIT — see [LICENSE](LICENSE).

Third-party dependencies are listed in `backend/requirements.txt` and the relevant frontend `package.json` files.

## Project links

- Live app: https://portaldotopssuite.vercel.app/
- Proposal / pitch deck: https://canva.link/37h3p0u02gn8y4x
- Source repository: https://github.com/Mlnglh889/hacktoon-ops-suite
- Demo video: https://x.com/Lannna4332/status/2113643661250719786
- Testnet explorer: https://scanner-testnet-v3.portaldot.dev
- Node console: https://node-console.portaldot.dev
- Substrate RPC: https://test-node-v3.portaldot.dev
- EVM RPC: https://test-evm-rpc-v3.portaldot.dev

This README describes the current website and the repository boundaries as of the latest verified deployment. Live chain numbers and stale/live state should be read from the website or API at runtime, not copied into static documentation.

## Contributing

Keep changes narrow and verifiable:

1. Read the relevant code and existing evidence first.
2. Preserve the non-custodial wallet boundary.
3. Use `tPOT` consistently; do not introduce `POT`, `tPot`, or `dot` as the token unit.
4. Add or update tests for behavior changes.
5. Run the relevant build/test command.
6. Report live deployment and chain state honestly.
7. Do not push changes until the final diff has been reviewed.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for repository-specific development notes.

---

Built for the Portaldot Hacker House 2026 testnet build.