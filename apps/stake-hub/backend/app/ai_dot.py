"""Ask AI orchestration: app knowledge + live context + provider adapter.

Public entry point: answer(question, address=None) -> dict
  reply    str | None   model text
  ok       bool
  model    str | None
  provider str
  error    str | None
  context  str          exactly what the model was given (shown in the UI on failure)
"""
import os
import time

from app.ai_context import APP_KNOWLEDGE, build_context
from app import ai_llm

SYSTEM_PROMPT = """You are Dot, the built-in assistant of the Portaldot Stake Hub web app
(Portaldot V3 testnet). You are a support engineer for THIS dashboard: you explain what the
user sees on screen and why, diagnose problems, and quote live chain values.

How to answer:
1. Lead with the direct answer in one sentence.
2. Then the reason, quoting the specific number/field from the live context and naming its source,
   e.g. "(RPC health)" or "(payouts, era 61)".
3. Then the concrete next step the user can take inside the app.
4. Length: 2-5 short sentences, or a short list when giving steps. Use tPOT, never POT or mainnet.

Grounding rules:
- The live context below and the app map are your only sources. Do not invent values.
- When a block in the context is marked UNAVAILABLE, say that specific data is unavailable and why.
  Never fill the gap with a plausible number.
- Distinguish clearly: live vs CACHED vs CACHED-LAST-GOOD. A cached reading is not live.
- "Est. APY" and reward projections are model estimates, not verified payouts. Say so.
- /api/v1/security/slashing is simulated demo data. Never present it as real slashing.
- A transaction is only successful with an on-chain receipt of status 0x1. You cannot send or sign
  anything; the user signs in their own wallet extension.
- Never ask for or accept a seed phrase, mnemonic, private key or password.
- If the question is not about this app or Portaldot staking, answer briefly and steer back.

You answer in the language the user writes in (Indonesian or English)."""


def _user_prompt(question, context, address):
    wallet_line = f"Connected wallet address: {address}" if address else "Connected wallet address: none supplied"
    return (
        f"{APP_KNOWLEDGE}\n\n"
        f"## Live context (read moments ago from this service's own API)\n{context}\n\n"
        f"## Request\n{wallet_line}\n"
        f"User question: {question}"
    )


def answer(question, address=None):
    started = time.time()
    context = build_context(address)
    result = ai_llm.ask(SYSTEM_PROMPT, _user_prompt(question, context, address))
    return {
        "reply": result.get("reply"),
        "ok": result.get("reply") is not None,
        "model": result.get("model"),
        "provider": result.get("provider"),
        "error": result.get("error"),
        "context": context,
        "elapsed_s": round(time.time() - started, 2),
    }


def health():
    """Configuration summary for the UI. Never includes the key itself."""
    cfg = ai_llm.config()
    return {
        "provider": cfg["provider"],
        "model": cfg["model"],
        "models": cfg["models"],
        "base_url": cfg["base_url"],
        "has_key": cfg["has_key"],
        "timeout_s": cfg["timeout"],
        "context_bytes": len(build_context(None)),
    }