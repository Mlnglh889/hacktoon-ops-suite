"""Application knowledge for the Stake Hub assistant.

Two things live here:

1. APP_KNOWLEDGE - a factual map of the web app: what each page shows, which chain
   field or API field backs every number, which values are deliberately unavailable,
   and which error strings the user can actually see. The model is told to answer
   app questions ("why is my portfolio empty?", "why does it say Degraded?") from
   this map plus the live context, never from improvisation.

2. build_context() - live state pulled from this service's own API, so a question
   about a problem is answered with the current values.

Nothing in this module invents data. When an endpoint fails the context says
UNAVAILABLE with the real error.
"""
import concurrent.futures
import json
import os
import threading
import time
import urllib.error
import urllib.request

API_BASE = os.environ.get("PORTALDOT_API_BASE", "http://127.0.0.1:8100").rstrip("/")
# /api/v3/network and /api/v3/validators wait on a cold Substrate RPC (measured ~15 s on
# first read), so the client timeout must be above the server's own V3_RPC_TIMEOUT (20 s).
API_TIMEOUT = float(os.environ.get("PORTALDOT_AI_API_TIMEOUT", "25"))
# A question rarely needs sub-30 s freshness, and every block costs an RPC round trip.
# Caching the grounding context keeps answers fast without ever serving it as "live"
# silently: the capture timestamp is printed inside the context itself.
CONTEXT_TTL = float(os.environ.get("PORTALDOT_AI_CONTEXT_TTL", "30"))
_CONTEXT_CACHE = {}
_CONTEXT_LOCK = threading.Lock()
_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=6, thread_name_prefix="ai-ctx")

APP_KNOWLEDGE = """## What this web app is
Portaldot Stake Hub, a non-custodial dashboard for the Portaldot V3 testnet.
Chain: Substrate NPoS. Native token symbol: tPOT (testnet). EVM chain id 420420777.
Explorer used by the app: https://node-console.portaldot.dev
The app never holds keys. Every transaction is signed by the user's own wallet extension.

## Pages and the exact source of every number
- Overview (/overview): block number, era, validator count, total stake from GET /api/v3/overview
  and GET /api/v3/network. APY, USD price, personal balance and payout history are
  intentionally NOT shown; the page states this in "Staking data status".
- Validators (/validators): validator list from GET /api/v3/validators
  (Staking.ErasStakersOverview / ErasStakersPaged / ErasValidatorPrefs / Session.Validators).
  Columns: total stake, own stake, nominators, commission, era points. Snapshot changes come
  from GET /api/v3/snapshots/changes (persisted diffs, not live guesses).
- Stake (/stake): builds a bond/nominate extrinsic for the connected account.
  Client-side validation messages the user can hit:
    "Enter a valid tPOT amount with up to 14 decimals"
    "Amount must be greater than 0 tPOT"
    "Insufficient free balance for fee/reserve: need X tPOT"
    "Select between 1 and 16 validators"
    "Amount is below runtime minimum bond of X tPOT"
  The success banner is only valid when the receipt status is 0x1. "Est. APY" on this page is a
  MODEL ESTIMATE, not a verified payout; the page says so in its advisory.
- Unstake (/unstake): reads the wallet ledger and nominations, then builds
  unbond / chill / nominate-remove extrinsics. Shows "No wallet nominations were found." when
  the ledger has no targets, and "Unable to read the staking ledger." when the chain read fails.
- Portfolio (/portfolio): connected account position, nominations, and Payout History.
  Payout rows come from GET /api/v3/payouts?address=<SS58>&eras=N, computed from
  ErasValidatorReward, ErasRewardPoints, ErasStakersOverview, ErasStakersPaged,
  ErasValidatorPrefs, ClaimedRewards and Payee at one pinned block. Read-only viewing works via
  /portfolio?address=<SS58> without connecting a wallet.
  A row shows claim_state = claimed when the era is in ClaimedRewards, unclaimed otherwise.
  Rows in the current era have no reward yet and render as "NOT PAYABLE YET".
- RPC Analyst (/infra): GET /api/v3/infra/rpc. Each endpoint is probed with a real JSON-RPC call
  (system_health + chain_getHeader). Circuit breaker opens after repeated failures.
  Latency classes use measured thresholds: slow when latency >= V3_RPC_SLOW_MS (default 1000 ms),
  degraded when latency > V3_RPC_DEGRADED_MS (default 3000 ms). A per-endpoint breaker state of
  closed / half_open / open is shown; open means the app stopped hammering a dead endpoint.
- Alerts (/alerts): GET /api/v3/incidents?window=1h|24h|7d builds an incident timeline only from
  persisted evidence: validator change rows in v3_snapshots.db and probe samples in rpc_health.db.
  Incident kinds: commission_change, membership_change, stake_change, nominator_change,
  rpc_endpoint_failure, rpc_backend_failure, rpc_degraded, rpc_slow, rpc_stale, block_head_stalled.
  The Delivery panel reads GET /api/v3/telegram/status: configured, bot username, worker liveness,
  subscriber counts and how many alerts were actually delivered. If that endpoint fails the panel
  shows UNREACHABLE instead of pretending the bot is off.
- Ask AI (/ai): this assistant.

## Honesty rules the UI follows (and you must follow)
- Unavailable data is shown as unavailable, never estimated into existence.
- "Est. APY" and reward projections are model estimates, clearly labelled.
- /api/v1/security/slashing returns SIMULATED demo data. It is not chain slashing evidence.
  The Ask AI telemetry tile therefore says "Slashing (chain): No chain data".
- Every number carries a source: live, cache, or stale. A cached value is not presented as live.

## Diagnostics playbook for common complaints
- "Portfolio / payouts empty": (a) no wallet connected and no ?address= in the URL; (b) the address
  has no exposure in the requested era window, so the table is legitimately empty; (c) the chain read
  failed and the endpoint returned an error. Check the payouts block in the context for which one.
- "Validator missing": the validator may not be in the active set for the current era, the list may
  be cached from an earlier block, or the session key is not registered.
- "Slow / Degraded": compare measured latency against the slow and degraded thresholds above.
  Degraded is a latency symptom, not proof the chain is down; check block number progress.
- "Stale / CACHED badge": the RPC read timed out so the last good payload is served with stale=true.
  The fix is RPC reachability, not the UI.
- "Stake or Unstake failed": map the message to the validation list above. Insufficient balance,
  below minimum bond, or more than 16 validators are the common causes. A transaction is only
  successful with receipt 0x1 and a matching on-chain event.
- "Telegram not delivering": check configured, worker_running, subscriber state (active vs
  awaiting_address) and delivered.total. A subscriber stuck in awaiting_address never confirmed
  with CONFIRM, so no alert can reach them.
- "Numbers did not change": overview and validators are cached about 60 s and the era advances
  slowly; compare block numbers, not wall-clock seconds.

## Hard safety rules for you
- Never ask for, accept or repeat a seed phrase, mnemonic, private key or keystore password.
- Never claim a transaction succeeded. Only an on-chain receipt can prove that.
- Never invent an APY, price, reward or balance.
- You cannot sign or send transactions. Explain what to do; the user signs in their own wallet.
"""


def _fetch(path):
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        headers={"User-Agent": "stakehub-ai", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=API_TIMEOUT) as resp:
            return json.loads(resp.read()), None
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode()[:160]
        except Exception:
            pass
        return None, f"HTTP {exc.code} {detail}".strip()
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"[:200]


def _stamp(payload):
    if not isinstance(payload, dict):
        return ""
    if payload.get("stale"):
        return " CACHED-LAST-GOOD"
    served = payload.get("served_from")
    if served == "cache":
        return " CACHED"
    if served == "live":
        return " LIVE"
    return ""


def _pot(value, places=6):
    if value is None:
        return "n/a"
    try:
        return f"{float(value):,.{places}f}"
    except (TypeError, ValueError):
        return str(value)


def _network():
    data, err = _fetch("/api/v3/network")
    if err or not data:
        return f"[1] Network UNAVAILABLE ({err})."
    return (
        f"[1] Network ({data.get('source', 'V3 RPC')}{_stamp(data)}): era {data.get('era')} · "
        f"block {data.get('block_number')} · total staked {_pot(data.get('total_staked_pot'))} tPOT · "
        f"issuance {_pot(data.get('total_issuance_pot'), 2)} tPOT · "
        f"staking ratio {data.get('staking_ratio_pct')}%."
    )


def _validators():
    data, err = _fetch("/api/v3/validators")
    if err or not data:
        return f"[2] Validators UNAVAILABLE ({err})."
    rows = data.get("validators") or []
    if not rows:
        return "[2] Validators: the active set for the current era is empty."
    lines = [f"[2] Validators ({len(rows)} in active set, block {data.get('block_number')}{_stamp(data)}):"]
    for v in rows[:16]:
        issues = f" · data issues: {', '.join(v['data_errors'])}" if v.get("data_errors") else ""
        lines.append(
            f"- {v.get('nickname') or v.get('address')} · total {_pot(v.get('total_pot'))} tPOT · "
            f"own {_pot(v.get('own_pot'))} tPOT · nominators {v.get('nominator_count')} · "
            f"commission {v.get('commission_pct')}% · era points {v.get('points')}{issues}"
        )
    return "\n".join(lines)


def _rpc():
    data, err = _fetch("/api/v3/infra/rpc")
    if err or not data:
        return f"[3] RPC health UNAVAILABLE ({err})."
    thresholds = data.get("thresholds") or {}
    lines = [
        f"[3] RPC health: {data.get('healthy', '?')}/{data.get('count', '?')} endpoints healthy · "
        f"slow >= {thresholds.get('slow_ms', '?')} ms · degraded > {thresholds.get('degraded_ms', '?')} ms."
    ]
    for ep in (data.get("endpoints") or [])[:6]:
        hist = ep.get("history") or {}
        lines.append(
            f"- {ep.get('endpoint')} ({ep.get('chain_family')}): {'up' if ep.get('ok') else 'DOWN'} · "
            f"latency {ep.get('latency_ms')} ms · class {ep.get('latency_status')} · "
            f"breaker {ep.get('state')} · block {ep.get('block_number')} · "
            f"samples {hist.get('sample_count')}"
            + (f" · error {ep.get('error')}" if ep.get("error") else "")
        )
    return "\n".join(lines)


def _incidents():
    data, err = _fetch("/api/v3/incidents?window=24h")
    if err or not data:
        return f"[4] Incidents UNAVAILABLE ({err})."
    by = data.get("by_severity") or {}
    sources = data.get("sources") or {}
    snap = (sources.get("validator_changes") or {}).get("rows")
    rpc = (sources.get("rpc_samples") or {}).get("count")
    head = (
        f"[4] Incidents last 24h: {data.get('count', 0)} total "
        f"({by.get('critical', 0)} critical, {by.get('warning', 0)} warning, {by.get('info', 0)} info). "
        f"Evidence: {snap if snap is not None else 'n/a'} validator change rows, "
        f"{rpc if rpc is not None else 'n/a'} RPC probe samples."
    )
    items = []
    for inc in (data.get("incidents") or [])[:8]:
        items.append(
            f"- {inc.get('severity')} · {inc.get('kind')} · "
            f"{inc.get('title') or inc.get('detail') or ''}".strip()
        )
    return "\n".join([head] + items)


def _telegram():
    data, err = _fetch("/api/v3/telegram/status")
    if err or not data:
        return f"[5] Telegram delivery status UNAVAILABLE ({err})."
    subs = data.get("subscriptions") or {}
    delivered = data.get("delivered") or {}
    last = delivered.get("last_sent_at")
    when = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(last)) if last else "never"
    return (
        f"[5] Telegram: configured {data.get('configured')} · bot @{data.get('bot_username') or 'unknown'} · "
        f"worker {'running' if data.get('worker_running') else 'NOT running'} · "
        f"subscribers active {subs.get('active', 0)}/{subs.get('total', 0)} "
        f"(awaiting wallet {subs.get('awaiting_address', 0)}, awaiting confirm {subs.get('awaiting_confirm', 0)}, "
        f"cancelled {subs.get('cancelled', 0)}) · "
        f"delivered {delivered.get('total', 0)} alerts, last {when}."
        + (f" · note: {data.get('detail') or data.get('bot_error') or data.get('db_error')}" if (data.get('detail') or data.get('bot_error') or data.get('db_error')) else "")
    )


def _payouts(address):
    if not address:
        return ("[6] Portfolio/payouts: no wallet address supplied with this question, so personal "
                "position and payout history were not read. State that a wallet must be connected "
                "(or ?address=<SS58> used) and do not guess the user's position.")
    data, err = _fetch(f"/api/v3/payouts?address={address}&eras=8")
    if err or not data:
        return f"[6] Payouts for {address} UNAVAILABLE ({err})."
    totals = data.get("totals") or {}
    rows = data.get("rows") or []
    lines = [
        f"[6] Payouts for {address} ({_stamp(data)}): payee {data.get('payee')} · "
        f"eras {data.get('eras')} · {len(rows)} era/validator rows · "
        f"reward {_pot(totals.get('reward_pot'), 8)} tPOT · claimed {_pot(totals.get('claimed_pot'), 8)} · "
        f"pending {_pot(totals.get('pending_pot'), 8)}."
    ]
    if not rows:
        lines.append("- The address has no staking exposure in this era window, so the table is empty by data, not by bug.")
    for row in rows[-6:]:
        lines.append(
            f"- era {row.get('era')} · validator {row.get('validator')} · stake {_pot(row.get('stake_pot'))} · "
            f"reward {_pot(row.get('reward_pot'), 8) if row.get('reward_pot') is not None else 'not payable yet'} · "
            f"{row.get('claim_state')}"
        )
    return "\n".join(lines)


def build_context(address=None):
    """Live grounding context: chain state plus app delivery/health state.

    Blocks are fetched in parallel (a cold Substrate read must not serialize behind an
    RPC probe) and the result is cached for CONTEXT_TTL seconds. The wallet address is
    part of the cache key, so a personal read is never served to a different address.
    """
    key = address or "-"
    now = time.monotonic()
    with _CONTEXT_LOCK:
        hit = _CONTEXT_CACHE.get(key)
        if hit and now - hit[0] < CONTEXT_TTL:
            return hit[1]
    jobs = [_network, _validators, _rpc, _incidents, _telegram]
    futures = [_POOL.submit(job) for job in jobs]
    if address:
        futures.append(_POOL.submit(_payouts, address))
    blocks = []
    for index, future in enumerate(futures):
        try:
            blocks.append(future.result(timeout=API_TIMEOUT + 10))
        except Exception as exc:  # a failed block is reported, never silently dropped
            blocks.append(f"[{index + 1}] UNAVAILABLE ({type(exc).__name__}: {exc})")
    if not address:
        blocks.append(_payouts(None))
    blocks.append(
        f"[7] Context captured at {time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime())}"
        f" (cached up to {CONTEXT_TTL:g}s)."
    )
    context = "\n".join(blocks)
    with _CONTEXT_LOCK:
        if len(_CONTEXT_CACHE) > 64:
            _CONTEXT_CACHE.clear()
        _CONTEXT_CACHE[key] = (now, context)
    return context