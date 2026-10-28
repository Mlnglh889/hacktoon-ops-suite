"""LLM provider adapter for the Portaldot Stake Hub assistant.

Supports two wire formats, selected by PORTALDOT_AI_PROVIDER:
  openai   - any OpenAI-compatible /v1/chat/completions endpoint (default)
  gemini   - Google Generative Language :generateContent

Everything is environment-driven so the operator can swap provider/model/key
without touching code:

  PORTALDOT_AI_PROVIDER   openai | gemini           (default openai)
  PORTALDOT_AI_BASE_URL   https://api.xkiro.com/v1  (openai)  /  https://generativelanguage.googleapis.com (gemini)
  PORTALDOT_AI_MODEL      xiaomi/mimo-v2.6-flash
  PORTALDOT_AI_API_KEY    <secret>
  PORTALDOT_AI_FALLBACK_MODELS  comma separated, optional
  PORTALDOT_AI_TIMEOUT    seconds, default 45
  PORTALDOT_AI_PROXY      socks5h://127.0.0.1:40000 (only if egress needs the proxy)

The key is never returned to the browser and never written to logs.
"""
import json
import os
import urllib.error
import urllib.request


def _env(name, default=""):
    return (os.environ.get(name) or default).strip()


def config():
    provider = _env("PORTALDOT_AI_PROVIDER", "openai").lower()
    if provider == "gemini":
        base = _env("PORTALDOT_AI_BASE_URL", "https://generativelanguage.googleapis.com").rstrip("/")
        model = _env("PORTALDOT_AI_MODEL", "gemini-3.5-flash")
    else:
        base = _env("PORTALDOT_AI_BASE_URL", "https://api.xkiro.com/v1").rstrip("/")
        model = _env("PORTALDOT_AI_MODEL", "xiaomi/mimo-v2.6-flash")
    extra = [m.strip() for m in _env("PORTALDOT_AI_FALLBACK_MODELS").split(",") if m.strip()]
    models = [model] + [m for m in extra if m != model]
    return {
        "provider": provider,
        "base_url": base,
        "models": models,
        "model": model,
        "has_key": bool(_env("PORTALDOT_AI_API_KEY") or _env("GEMINI_API_KEY")),
        "timeout": float(_env("PORTALDOT_AI_TIMEOUT", "45")),
        "proxy": _env("PORTALDOT_AI_PROXY"),
    }


def _api_key(cfg):
    if cfg["provider"] == "gemini":
        return _env("PORTALDOT_AI_API_KEY") or _env("GEMINI_API_KEY")
    return _env("PORTALDOT_AI_API_KEY")


def _opener(cfg):
    proxy = cfg["proxy"]
    if not proxy:
        return urllib.request.build_opener()
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({"https": proxy, "http": proxy})
    )


def _post(opener, url, payload, headers, timeout):
    """POST JSON.

    Note on User-Agent: api.xkiro.com sits behind a WAF that answers 403
    ("error code: 1010") to the default Python-urllib User-Agent, while the same
    request with a curl User-Agent succeeds. The header below is set for that reason,
    not to disguise anything: the endpoint is the operator's own chosen provider.
    """
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers=headers, method="POST"
    )
    with opener.open(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _openai_call(cfg, key, model, system, user, timeout):
    base = cfg["base_url"]
    url = base if base.endswith("/chat/completions") else f"{base}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
        "max_tokens": 1400,
        "stream": False,
    }
    data = _post(
        _opener(cfg), url, payload,
        {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "curl/8.5.0", "Authorization": f"Bearer {key}"},
        timeout,
    )
    for choice in data.get("choices") or []:
        message = choice.get("message") or {}
        text = (message.get("content") or "").strip()
        if text:
            return text
        # Some reasoning models put the answer in reasoning_content when content is empty.
        alt = (message.get("reasoning_content") or "").strip()
        if alt:
            return alt
    return None


def _gemini_call(cfg, key, model, system, user, timeout):
    url = f"{cfg['base_url']}/v1beta/models/{model}:generateContent?key={key}"
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": user}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1400},
    }
    data = _post(_opener(cfg), url, payload, {"Content-Type": "application/json"}, timeout)
    for candidate in data.get("candidates") or []:
        for part in (candidate.get("content") or {}).get("parts") or []:
            text = (part.get("text") or "").strip()
            if text:
                return text
    return None


def ask(system, user):
    """Return dict(reply, model, provider, error). Never raises."""
    cfg = config()
    key = _api_key(cfg)
    if not key:
        return {
            "reply": None, "model": None, "provider": cfg["provider"],
            "error": "No API key configured: set PORTALDOT_AI_API_KEY for this service.",
        }
    call = _gemini_call if cfg["provider"] == "gemini" else _openai_call
    errors = []
    for model in cfg["models"]:
        try:
            text = call(cfg, key, model, system, user, cfg["timeout"])
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                body = json.loads(exc.read())
                detail = (body.get("error") or {}).get("message") or body.get("message") or ""
            except Exception:
                pass
            errors.append(f"{model}: HTTP {exc.code} {detail}".strip()[:180])
            if exc.code in (400, 401, 403, 404) and model == cfg["models"][0]:
                continue  # bad model name or auth -> try the next candidate
            continue
        except Exception as exc:
            errors.append(f"{model}: {type(exc).__name__}: {exc}"[:180])
            continue
        if text:
            return {"reply": text, "model": model, "provider": cfg["provider"], "error": None}
        errors.append(f"{model}: empty response")
    return {
        "reply": None, "model": None, "provider": cfg["provider"],
        "error": "; ".join(errors)[:400],
    }