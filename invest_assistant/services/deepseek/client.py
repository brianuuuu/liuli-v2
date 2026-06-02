import json
from time import perf_counter
from urllib import request

from invest_assistant.bootstrap.config import get_settings
from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.system_config.models import SystemConfig
from invest_assistant.services.ai_debug_logger import write_ai_debug_log

DEEPSEEK_API_KEY_CONFIG_KEYS = ("deepseek-api-key", "deepseek_api_key", "DEEPSEEK_API_KEY")
DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash"


def get_deepseek_api_key() -> str:
    db = SessionLocal()
    try:
        for config_key in DEEPSEEK_API_KEY_CONFIG_KEYS:
            config = db.query(SystemConfig).filter(SystemConfig.config_key == config_key).one_or_none()
            if config is not None and config.enabled and config.config_value.strip():
                return config.config_value.strip()
    finally:
        db.close()
    return get_settings().deepseek_api_key.strip()


def _prompt_task_name(prompt) -> str:
    return str(getattr(prompt, "target_task", None) or getattr(prompt, "prompt_key", None) or "unknown")


def _chat_json(prompt, model: str, data_payload: dict) -> dict:
    api_key = get_deepseek_api_key()
    if not api_key:
        raise RuntimeError("deepseek api key is not configured")

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": prompt.system_prompt,
            },
            {
                "role": "user",
                "content": prompt.user_prompt + "\n\n" + json.dumps(data_payload, ensure_ascii=False, separators=(",", ":")),
            },
        ],
        "thinking": {"type": "disabled"},
        "response_format": {"type": prompt.response_format},
        "stream": False,
        "temperature": 0.2,
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        DEEPSEEK_API_URL,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    started = perf_counter()
    task_name = _prompt_task_name(prompt)
    try:
        with request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
    except Exception as exc:
        write_ai_debug_log(
            provider="deepseek",
            model=model,
            task_name=task_name,
            endpoint=DEEPSEEK_API_URL,
            request_payload=payload,
            status="failed",
            duration_ms=int((perf_counter() - started) * 1000),
            error_message=str(exc),
        )
        raise RuntimeError(f"deepseek request failed: {exc}") from exc

    response_payload = json.loads(raw)
    content = response_payload["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    parsed["usage"] = response_payload.get("usage") or {}
    write_ai_debug_log(
        provider="deepseek",
        model=model,
        task_name=task_name,
        endpoint=DEEPSEEK_API_URL,
        request_payload=payload,
        raw_response=raw,
        parsed_response=parsed,
        status="success",
        duration_ms=int((perf_counter() - started) * 1000),
    )
    return parsed


def extract_hotwords(news: list[dict], prompt, model: str = DEFAULT_DEEPSEEK_MODEL) -> dict:
    return _chat_json(prompt, model, {"news": news})


def suggest_hotword_merges(candidates: list[dict], existing_hotwords: list[dict], prompt, model: str = DEFAULT_DEEPSEEK_MODEL) -> dict:
    return _chat_json(prompt, model, {"candidates": candidates, "existing_hotwords": existing_hotwords})


def review_stock_materials(materials: list[dict], prompt, model: str = DEFAULT_DEEPSEEK_MODEL) -> dict:
    return _chat_json(prompt, model, {"materials": materials})


def review_track_materials(materials: list[dict], prompt, model: str = DEFAULT_DEEPSEEK_MODEL) -> dict:
    return _chat_json(prompt, model, {"materials": materials})
