import json
from urllib import request

from invest_assistant.bootstrap.config import get_settings
from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.system_config.models import SystemConfig

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


def extract_hotwords(news: list[dict], prompt, model: str = DEFAULT_DEEPSEEK_MODEL) -> dict:
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
                "content": prompt.user_prompt + "\n\n" + json.dumps({"news": news}, ensure_ascii=False, separators=(",", ":")),
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
    try:
        with request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
    except Exception as exc:
        raise RuntimeError(f"deepseek request failed: {exc}") from exc

    response_payload = json.loads(raw)
    content = response_payload["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    parsed["usage"] = response_payload.get("usage") or {}
    return parsed
