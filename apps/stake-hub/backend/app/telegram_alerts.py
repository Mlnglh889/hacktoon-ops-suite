"""Server-side Telegram delivery for persisted Critical/Warning incidents.

Secrets are read from environment only. The worker never logs the bot token.
Incident identity is deterministic and stored in a separate SQLite state DB so
restarts do not resend the same evidence.
"""
import hashlib
import json
import os
import sqlite3
import threading
import time
from typing import Any

import requests

POLL_SECONDS = int(os.getenv("TELEGRAM_ALERT_POLL_SECONDS", "30"))
STATE_DB = os.getenv(
    "TELEGRAM_ALERT_STATE_DB",
    os.path.join(os.path.dirname(__file__), "data", "telegram_alerts.db"),
)


def _config():
    return os.getenv("TELEGRAM_ALERT_BOT_TOKEN"), os.getenv("TELEGRAM_ALERT_CHAT_ID")


_WORKER_STARTED_AT = None
_WORKER_STARTED = False


def _now() -> "int | None":
    """Current unix seconds, tolerant of a stubbed module clock (used in tests).

    The module-level `time` binding is replaced by a stub in tests, so the clock is read
    dynamically and typed as Any rather than assuming the real `time` module.
    """
    clock: Any = getattr(time, "time", None)
    if not callable(clock):
        return None
    try:
        return int(clock())
    except Exception:
        return None


def status_snapshot() -> dict[str, Any]:
    """Real delivery status for the Alerts page.

    Reports configuration, worker liveness, subscriber mix and the last delivered
    incident. Nothing here is inferred from the UI: every field is read from the
    environment or the state DB, so the dashboard cannot claim "NOT CONFIGURED"
    while a token is present (or claim delivery while nothing was ever sent).
    """
    token, chat_id = _config()
    configured = bool(token)
    payload: dict[str, Any] = {
        "configured": configured,
        "bot_username": None,
        "owner_chat_configured": bool(chat_id),
        "worker_running": _WORKER_STARTED_AT is not None,
        "worker_started_at": _WORKER_STARTED_AT,
        "poll_seconds": POLL_SECONDS,
        "subscriptions": {"total": 0, "active": 0, "awaiting_address": 0,
                          "awaiting_confirm": 0, "cancelled": 0},
        "delivered": {"total": 0, "last_sent_at": None},
        "source": "telegram_alerts state DB + environment",
    }
    if not configured:
        payload["detail"] = "TELEGRAM_ALERT_BOT_TOKEN is not set for this service."
        return payload
    # Bot identity, so the UI can show which bot will send. Failure is reported, not hidden.
    try:
        response = requests.get(
            f"https://api.telegram.org/bot{token}/getMe",
            timeout=8,
        )
        body = response.json()
        if body.get("ok"):
            payload["bot_username"] = (body.get("result") or {}).get("username")
        else:
            payload["bot_error"] = body.get("description")
    except Exception as error:
        payload["bot_error"] = f"{type(error).__name__}: {error}"[:160]
    if not os.path.exists(STATE_DB):
        payload["detail"] = "No state DB yet: no subscriber has sent /start."
        return payload
    try:
        con = sqlite3.connect(STATE_DB, timeout=10)
        try:
            for state, count in con.execute(
                "SELECT state, COUNT(*) FROM subscriptions GROUP BY state"
            ).fetchall():
                if state in payload["subscriptions"]:
                    payload["subscriptions"][state] = count
                payload["subscriptions"]["total"] += count
            con.execute(
                "CREATE TABLE IF NOT EXISTS sent_incidents "
                "(identity TEXT PRIMARY KEY, sent_at INTEGER NOT NULL, status TEXT NOT NULL)"
            )
            row = con.execute(
                "SELECT COUNT(*), MAX(sent_at) FROM sent_incidents"
            ).fetchone()
            payload["delivered"]["total"] = row[0] or 0
            payload["delivered"]["last_sent_at"] = row[1]
        finally:
            con.close()
    except Exception as error:
        payload["db_error"] = f"{type(error).__name__}: {error}"[:160]
    return payload


def _db():
    os.makedirs(os.path.dirname(STATE_DB), exist_ok=True)
    con = sqlite3.connect(STATE_DB, timeout=10)
    con.execute("CREATE TABLE IF NOT EXISTS sent_incidents (identity TEXT PRIMARY KEY, sent_at INTEGER NOT NULL, status TEXT NOT NULL)")
    con.execute("""CREATE TABLE IF NOT EXISTS subscriptions (
        chat_id TEXT PRIMARY KEY, address TEXT, state TEXT NOT NULL,
        alerts_critical INTEGER NOT NULL DEFAULT 1, alerts_warning INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )""")
    con.execute("CREATE TABLE IF NOT EXISTS telegram_updates (update_id INTEGER PRIMARY KEY)")
    con.commit()
    return con


def incident_identity(incident: dict[str, Any]) -> str:
    evidence = incident.get("evidence") or {}
    # Keep identity stable across polling. Volatile values (latency, stale seconds,
    # latest block) belong in the message, but must not cause duplicate alerts.
    stable_evidence = {
        key: evidence.get(key)
        for key in ("endpoint", "family", "field", "failure_kind", "snapshot_id")
        if evidence.get(key) is not None
    }
    stable = {
        "kind": incident.get("kind"),
        "severity": incident.get("severity"),
        "address": incident.get("address"),
        "title": incident.get("title"),
        "evidence": stable_evidence,
    }
    raw = json.dumps(stable, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(raw.encode()).hexdigest()


def format_message(incident: dict[str, Any]) -> str:
    severity = str(incident.get("severity", "warning")).upper()
    icon = "🚨" if severity == "CRITICAL" else "⚠️"
    evidence = incident.get("evidence") or {}
    lines = [f"{icon} Portaldot {severity}", str(incident.get("title") or incident.get("kind") or "Incident")]
    if incident.get("detail"):
        lines.append(str(incident["detail"]))
    if incident.get("address"):
        lines.append(f"Address: {incident['address']}")
    if evidence.get("endpoint"):
        lines.append(f"Endpoint: {evidence['endpoint']}")
    for key in ("family", "last_block", "latest_ms", "threshold_ms", "stale_for_seconds", "field", "old", "new"):
        if evidence.get(key) is not None:
            lines.append(f"{key}: {evidence[key]}")
    lines.append("Source: persisted validator/RPC evidence")
    return "\n".join(lines)


def send_text(text: str, token: str | None = None, chat_id: str | None = None, reply_markup: dict | None = None) -> dict[str, Any]:
    token, chat_id = token or _config()[0], chat_id or _config()[1]
    if not token or not chat_id:
        raise RuntimeError("Telegram alert configuration is incomplete")
    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": text, **({"reply_markup": reply_markup} if reply_markup else {})},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("ok"):
        raise RuntimeError("Telegram sendMessage returned not-ok")
    return payload


def deliver(incidents: list[dict[str, Any]]) -> dict[str, int]:
    token, chat_id = _config()
    if not token or not chat_id:
        return {"sent": 0, "skipped": 0, "failed": 0}
    con = _db()
    sent = skipped = failed = 0
    try:
        for incident in incidents:
            if incident.get("severity") not in ("critical", "warning"):
                skipped += 1
                continue
            identity = incident_identity(incident)
            if con.execute("SELECT 1 FROM sent_incidents WHERE identity=?", (identity,)).fetchone():
                skipped += 1
                continue
            try:
                send_text(format_message(incident), token, chat_id)
                con.execute("INSERT INTO sent_incidents VALUES (?, ?, ?)", (identity, int(time.time()), "sent"))
                con.commit()
                sent += 1
            except Exception:
                failed += 1
        return {"sent": sent, "skipped": skipped, "failed": failed}
    finally:
        con.close()



WELCOME = "Selamat datang di Portaldot Alerts.\n\nKirim alamat wallet SS58 Anda untuk memantau perubahan validator dan alert chain.\n\nJangan kirim seed phrase atau private key."
ASK_CONFIRM = "Alamat diterima: {address}\n\nKonfirmasi pantau alamat ini? Balas CONFIRM atau CANCEL."

def _valid_ss58(address):
    return isinstance(address, str) and len(address) >= 45 and len(address) <= 50 and address.startswith("5") and " " not in address

def _send_for_chat(chat_id, text, reply_markup=None):
    token, _ = _config()
    if not token: return
    send_text(text, token, str(chat_id), reply_markup)


def _answer_callback(callback_id, text=""):
    token, _ = _config()
    if not token: return
    requests.post(f"https://api.telegram.org/bot{token}/answerCallbackQuery", json={"callback_query_id": callback_id, "text": text}, timeout=10)


def _subscription_keyboard():
    return {"inline_keyboard": [[
        {"text": "✅ Confirm", "callback_data": "alert_confirm"},
        {"text": "✖ Cancel", "callback_data": "alert_cancel"},
    ]]}

def _handle_update(update):
    callback = update.get("callback_query") or {}
    if callback:
        message = callback.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        action = callback.get("data")
        if chat_id and action in ("alert_confirm", "alert_cancel"):
            con = _db(); now = int(time.time())
            try:
                if action == "alert_confirm":
                    con.execute("UPDATE subscriptions SET state='active',updated_at=? WHERE chat_id=?", (now, str(chat_id)))
                    con.commit(); _answer_callback(callback.get("id", ""), "Alerts aktif"); _send_for_chat(chat_id, "✅ Subscription aktif. Anda akan menerima Critical/Warning yang relevan.")
                else:
                    con.execute("UPDATE subscriptions SET state='cancelled',updated_at=? WHERE chat_id=?", (now, str(chat_id)))
                    con.commit(); _answer_callback(callback.get("id", ""), "Dibatalkan"); _send_for_chat(chat_id, "Subscription dibatalkan.")
            finally: con.close()
        return
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = (message.get("text") or "").strip()
    if not chat_id or not text: return
    con = _db(); now = int(time.time())
    try:
        row = con.execute("SELECT * FROM subscriptions WHERE chat_id=?", (str(chat_id),)).fetchone()
        if text.startswith("/start"):
            con.execute("INSERT INTO subscriptions(chat_id,state,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET state='awaiting_address',updated_at=excluded.updated_at", (str(chat_id), "awaiting_address", now, now))
            con.commit(); _send_for_chat(chat_id, WELCOME); return
        if text.startswith("/status"):
            if row and row[2] == "active":
                _send_for_chat(chat_id, f"✅ Subscription aktif untuk {row[1][:6]}…{row[1][-4:]}.")
            else:
                _send_for_chat(chat_id, "Belum aktif. Kirim /start untuk mulai.")
            return
        if text.startswith("/help"):
            if row and row[2] == "active" and row[1]:
                info = f"Status: aktif\nWallet: {row[1][:6]}…{row[1][-4:]}"
            elif row and row[2] == "awaiting_confirm" and row[1]:
                info = f"Status: menunggu konfirmasi\nWallet: {row[1][:6]}…{row[1][-4:]}"
            else:
                info = "Status: belum aktif\nWallet: belum diatur"
            _send_for_chat(chat_id, f"ℹ️ Portaldot Alerts\n\n{info}\n\nPerintah tersedia:\n/start — mulai atau atur wallet\n/status — cek status\n/stop — berhenti\n/help — tampilkan info ini\n/guide — lihat fitur tersedia\n\nAlert dikirim untuk Critical/Warning.\nJangan kirim seed phrase atau private key.")
            return
        if text.startswith("/guide"):
            _send_for_chat(chat_id, "📘 Fitur Portaldot Alerts\n\n• Pantau wallet SS58 per user\n• Alert Critical dan Warning\n• Perubahan validator membership\n• Perubahan commission, stake, dan nominators\n• RPC latency Slow/Degraded\n• RPC endpoint failure atau stale\n• Block head stalled per chain\n• Deduplikasi alert agar tidak spam\n• Tombol Confirm/Cancel subscription\n\nInfo event hanya tersedia di dashboard Alerts.\nJangan kirim seed phrase atau private key.")
            return
        if text.startswith("/stop") or text.upper() == "CANCEL":
            con.execute("UPDATE subscriptions SET state='cancelled',updated_at=? WHERE chat_id=?", (now,str(chat_id))); con.commit(); _send_for_chat(chat_id,"Subscription dibatalkan."); return
        if row and row[2] == "awaiting_confirm" and text.upper() == "CONFIRM":
            con.execute("UPDATE subscriptions SET state='active',updated_at=? WHERE chat_id=?",(now,str(chat_id))); con.commit(); _send_for_chat(chat_id,"Aktif. Anda akan menerima Critical/Warning yang relevan."); return
        if row and row[2] == "awaiting_address" and _valid_ss58(text):
            con.execute("UPDATE subscriptions SET address=?,state='awaiting_confirm',updated_at=? WHERE chat_id=?",(text,now,str(chat_id))); con.commit(); _send_for_chat(chat_id, ASK_CONFIRM.format(address=f"{text[:6]}…{text[-4:]}"), _subscription_keyboard()); return
        if row and row[2] == "active":
            _send_for_chat(chat_id,"Subscription aktif. Kirim /stop untuk berhenti."); return
        _send_for_chat(chat_id,"Kirim alamat SS58 yang diawali 5..., atau /start untuk mulai.")
    finally: con.close()

def poll_telegram_updates():
    token, _ = _config()
    if not token: return
    offset = 0
    con = _db()
    try:
        row=con.execute("SELECT max(update_id) FROM telegram_updates").fetchone(); offset=(row[0] or 0)+1
    finally: con.close()
    response=requests.get(f"https://api.telegram.org/bot{token}/getUpdates",params={"timeout":1,"offset":offset,"limit":50},timeout=10)
    data=response.json()
    for update in data.get("result",[]):
        _handle_update(update)
        con=_db()
        try: con.execute("INSERT OR IGNORE INTO telegram_updates(update_id) VALUES(?)",(update["update_id"],)); con.commit()
        finally: con.close()


def run_once() -> dict[str, int]:
    # Probe first. Never alert from an old history sample when the endpoint is
    # currently reachable. The fresh report is persisted before rules run.
    from app import rpc_health
    rpc_health.report("24h")
    from app.v3 import infra_incidents
    result = infra_incidents("24h")
    return deliver(result.get("incidents", []))


def start_worker() -> None:
    global _WORKER_STARTED_AT
    if not _config()[0]:
        return
    # Record liveness from the module import's clock namespace. Tests replace the
    # module-level `time` object with a stub, so this must stay a plain attribute call
    # rather than a new import.
    _WORKER_STARTED_AT = _now()

    def update_loop():
        # Telegram commands must stay responsive even while chain probes are slow.
        while True:
            try:
                poll_telegram_updates()
            except Exception:
                pass
            time.sleep(2)

    def incident_loop():
        if not _config()[1]:
            return
        while True:
            try:
                run_once()
            except Exception:
                pass
            time.sleep(POLL_SECONDS)

    threading.Thread(target=update_loop, name="telegram-command-worker", daemon=True).start()
    threading.Thread(target=incident_loop, name="telegram-incident-worker", daemon=True).start()


def reset_state_for_tests() -> None:
    if os.path.exists(STATE_DB):
        os.remove(STATE_DB)
