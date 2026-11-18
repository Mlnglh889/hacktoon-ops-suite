# OPS Suite — archived static site (18 Nov 2026)

The app moved off Vercel because the VPS disk was at 94% and the account was being
taken down. It is now served for free from GitHub Pages:

**https://mlnglh889.github.io/hacktoon-ops-suite/**

Served from branch `gh-pages`, which contains only build output (no source).

## How the archive stays honest

The React app normally reads `/api/v3/*`. That backend is retired, so the build
carries a frozen copy of every endpoint at `api/v3/*.json` plus this shim in
`index.html`:

```js
window.fetch = ... // rewrites /api/v3/<path> -> <base>/api/v3/<path with / -> _>.json
```

Each snapshot was captured from the last live read (block #520614, era 146) and
`api/v3/manifest.json` records when. A banner renders on every page from that
manifest so nobody mistakes frozen numbers for live ones. When a snapshot is
missing the request fails loudly instead of showing a fabricated value.

Two snapshots are deliberate placeholders that report absence, not fake data:

- `snapshots_latest.json` — collector retired, `collector.running = false`
- `snapshots_changes.json` — no change feed was exported, empty list with a source note

## Rebuild and republish

```bash
cd apps/stake-hub/apps/web
npm ci                                   # node_modules was removed to save disk
node node_modules/.bin/vite build --base=/hacktoon-ops-suite/

# refresh snapshots (only if a backend is running again)
# otherwise reuse data/snapshot-final/ + site-archive/ from this repo

# publish: copy dist/* to a worktree of gh-pages, plus index.html -> 404.html
git worktree add -f --detach /tmp/pages-wt origin/gh-pages
cp -r dist/* /tmp/pages-wt/
cp /tmp/pages-wt/index.html /tmp/pages-wt/404.html
touch /tmp/pages-wt/.nojekyll
cd /tmp/pages-wt && git add -A && git commit -m "pages: rebuild" && git push origin HEAD:gh-pages --force
gh api repos/Mlnglh889/hacktoon-ops-suite/pages/builds -X POST
```

Three things that bite:

1. `--base=/hacktoon-ops-suite/` is mandatory — a project page lives on a sub-path
   and root-absolute `/assets/...` URLs 404.
2. `BrowserRouter basename={import.meta.env.BASE_URL}` is mandatory, otherwise every
   route except `/` matches nothing and renders an empty shell (nav + footer only).
3. `.nojekyll` is mandatory, otherwise Jekyll hides paths starting with `_`.

## Evidence kept in the repo

| Artefact | Path |
|---|---|
| Deployment evidence | `data/deployment-evidence.json` |
| Testnet evidence log | `data/testnet-evidence.md` |
| Final API snapshots | `data/snapshot-final/*.json` |
| Contract artefact | `artifacts/OpsRegistry.json` |
| Demo videos (9.1 MB + 9.1 MB) | GitHub release tag `archive` |

## Local preview

```bash
cd /tmp/pages-wt && python3 -m http.server 8080
# http://localhost:8080/  (routes work because 404.html mirrors index.html)
```
