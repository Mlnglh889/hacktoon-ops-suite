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

## Verified state (2026-10-22)

- Backend tests: 17 passed (`.venv/bin/python -m pytest -q`).
- Live read at block 142410, era 39: 2 session validators, `ErasTotalStake` 20,141.32 tPOT.
- Stake Hub testnet transactions: stake 1 tPOT, unstake 1 tPOT, nominate 2 validators. See `data/testnet-evidence.md`.

## Open items

- OpsRegistry heartbeat: not deployed. Needs testnet gas and an explicit wallet signer.
- `data/heartbeat-payload.json`: from an older snapshot (block 71886, era 20). Regenerate before deployment.
- Repo visibility: private until 2026-10-24, then public (per owner).
