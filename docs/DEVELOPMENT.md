# Development Record

Build log for the Portaldot Hacker House 2026 submission. Dates are commit dates (UTC+0). Each entry matches a commit in `git log`.

| Date | Commit | Change |
|---|---|---|
| 2026-10-17 | `d907770` | Initialize Portaldot V3 ops suite foundation |
| 2026-10-17 | `b08efb1` | Exclude local environments and runtime data |
| 2026-10-17 | `e769473` | Validator metrics and live V3 collector check |
| 2026-10-17 | `227200f` | Collect validator eras and expose read-only API |
| 2026-10-17 | `40d3eaa` | V3 balance read and heartbeat proof foundation |
| 2026-10-18 | `3cf797d` | Read-only validator operations dashboard |
| 2026-10-18 | `cbbe20c` | Verified hackathon pitch |
| 2026-10-18 | `b7b4fa4` | Label dashboard data as collector snapshot |
| 2026-10-19 | `2e4d058` | Heartbeat registry contract source |
| 2026-10-19 | `e7ce16e` | Verified heartbeat deployment flow |
| 2026-10-19 | `47e44fd` | Deployment evidence endpoint |
| 2026-10-22 | `c7be044` | Sync pitch with live V3 read; add testnet tx evidence |
| 2026-10-22 | `4205034` | Add unstake 1 tPOT tx evidence (block 142760) |
| 2026-10-22 | `5450d14` | Add MIT license |
| 2026-10-22 | `088da9b` | Full README, development record, architecture link |
| 2026-10-22 | `1a144d0` | Add nominate change tx evidence (block 145577) |
| 2026-10-23 | `adcef7e` | Add stake (batchAll, block 154647) and unstake (block 154661) testnet evidence |
| 2026-10-23 | `9391b28` | Add nominate 01+02 testnet evidence (block 154674) |
| 2026-10-23 | `1b6959e` | Update testnet-evidence.md |
| 2026-10-23 | `987c6c3` | OpsRegistry deployed on Portaldot V3 EVM + heartbeat confirmed |
| 2026-10-23 | `bff2843` | Update OpsRegistry status to deployed + heartbeat confirmed |
| 2026-10-23 | `aa50d6c` | Remove superseded deployment-evidence example |
| 2026-10-23 | `6ecdab2` | Rewrite PITCH around validator health with verified era-44 snapshot |
| 2026-10-23 | `6c500ca` | English hook for PITCH (blind staking framing) |
| 2026-10-23 | `dc5c670` | Add blind-staking hook to top of README |
| 2026-10-23 | `9abd8d4` | Architecture split into Ops Suite (read-only) and Stake Hub (user-signed) + OpsRegistry path |
| 2026-10-23 | `0582f43` | Drop '(read-only)' and '(max 2)' labels from diagram and README |
| 2026-10-23 | `fb2eb19` | Remove remaining 'read-only' labels from architecture.svg |
| 2026-10-23 | `52fc946` | Collector reads ErasStakersOverview for exposure |
| 2026-10-23 | `0626520` | Add Stake Hub web app and API under apps/stake-hub |
| 2026-10-23 | `cf9b0d9` | Link demo video on X |
| 2026-10-23 | `e5036d9` | Add Ops Suite logo (svg + 512px png) |
| 2026-10-24 | `1a42fe3` | Add live Stake Hub website to README |
| 2026-10-25 | `17ee781` | Simplify validator header, single control row, merged filters |
| 2026-10-26 | `69b9d27` | RPC Analyst, snapshot collector, post-tx verification |

## Verified state (2026-10-28)

- Backend tests: 87 passed. One command from the repo root covers both suites:

  ```bash
  .venv/bin/python -m pytest
  ```

  `pytest.ini` points `testpaths` at `tests` and `apps/stake-hub/backend/tests`, and sets `pythonpath` so `import app.*` resolves inside the Stake Hub backend.
- TypeScript check clean: `npx tsc -p apps/stake-hub/apps/web/tsconfig.json --noEmit`.
- Vite build clean. Build output hashes match the deployed bundle exactly (`index-B_H18s9O.js`, `index-BOTAYUHL.css`), which confirms `apps/stake-hub` here is the same source that serves the live site.
- Live read at block 142410, era 39: 2 session validators, `ErasTotalStake` 20,141.32 tPOT.
- Stake Hub testnet transactions: stake 1 tPOT, unstake 1 tPOT, nominate 2 validators. See `data/testnet-evidence.md`.

## Open items

- OpsRegistry heartbeat: deployed at `0x132748201FbCB051CA6D73d26f27540a214d1336` (deploy tx `0xd1a94694ac01b494be79e977361d956af93a52e420fc9169c4c6219aadfb9a20`, block 159167). One heartbeat confirmed (tx `0x1166cfc1ba80a9663465c8106224d3b3672fadf241b525620c13698d73eafe77`, block 159265, heartbeatCount=1).
- `data/heartbeat-payload.json`: from an older snapshot (block 71886, era 20). Regenerate before deployment.
- Repo is public.
- `apps/stake-hub/backend/app/data/*.db` are runtime snapshot stores. They are git-ignored and recreated on first collector run.
