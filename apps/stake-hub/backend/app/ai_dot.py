# Gemini chat endpoint for Portaldot AI assistant.
# Appends to backend/app/main.py routes. Uses GEMINI_API_KEY env var.
import os
import json
import urllib.request
import urllib.error

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_BASE = os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com")

DOT_SYSTEM_PROMPT = """You are the Portaldot AI assistant for the PortaldotV3 Testnet Stake Hub.
Personality: warm, data-driven, concise. You never guess — you always cite live numbers.
Rules:
- Answers are short (2-4 sentences unless the user asks for detail).
- Always reference live data returned by the tools when available.
- Warn the user when a validator is risky (high commission or high risk score).
- If data is unavailable, say so honestly.
- End answers with a short helpful pointer when useful.
You answer in the language the user writes in."""

TOOLS_CONTEXT_SNIPPET = """Live network snapshot you may use:
"""


def _gather_context() -> str:
    """Pull live data from the Stake Hub DB to ground Kyki's answers."""
    lines = []
    try:
        req = urllib.request.Request("http://127.0.0.1:18100/api/v1/overview", headers={"User-Agent": "stakehub-ai"})
        stats = json.loads(urllib.request.urlopen(req, timeout=5).read())
        lines.append(f"Network: era {stats.get('era')}, block {stats.get('block_height')}, "
                     f"total staked {round(stats.get('total_staked_pot', 0)/1e15, 1)}M POT, "
                     f"staking ratio {stats.get('staking_ratio_pct')}%, validators {stats.get('validators')}.")
    except Exception as e:
        lines.append("Network stats unavailable right now.")
    try:
        req = urllib.request.Request("http://127.0.0.1:18100/api/v1/validators", headers={"User-Agent": "stakehub-ai"})
        vals = json.loads(urllib.request.urlopen(req, timeout=5).read()).get("validators", [])
        top = ", ".join(f"{v.get('name') or v['address'][:8]} (commission {v.get('commission')}%, "
                        f"stake {round(v.get('total_stake_pot', 0)/1e15, 2)}M, tier {v.get('tier')}, "
                        f"risk {v.get('risk_score')})" for v in vals[:11])
        lines.append(f"Validators: {top}.")
    except Exception:
        lines.append("Validator list unavailable right now.")
    return "\n".join(lines)


def _ask_gemini(user_message: str, context: str):
    if not GEMINI_KEY:
        return None
    payload = {
        "contents": [{
            "parts": [{
                "text": f"{DOT_SYSTEM_PROMPT}\n\n{TOOLS_CONTEXT_SNIPPET}{context}\n\nUser: {user_message}"
            }]
        }],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2000},
    }
    proxy = urllib.request.ProxyHandler({"https": "socks5h://127.0.0.1:40000", "http": "socks5h://127.0.0.1:40000"})
    opener = urllib.request.build_opener(proxy)
    models = ["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.0-flash"]
    for model in models:  # retry 3.8 twice (503 spikes are transient)
        req = urllib.request.Request(
            f"{GEMINI_BASE}/v1beta/models/{model}:generateContent?key={GEMINI_KEY}",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            resp = opener.open(req, timeout=25)
            data = json.loads(resp.read())
            cands = data.get("candidates", [])
            if cands:
                for p in cands[0].get("content", {}).get("parts", []):
                    if "text" in p:
                        return p["text"].strip()
        except urllib.error.HTTPError:
            continue
    return None
