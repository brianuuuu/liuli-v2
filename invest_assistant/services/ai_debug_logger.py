import json
from pathlib import Path
from uuid import uuid4

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.system_config.models import SystemConfig
from invest_assistant.shared.time_utils import utc_now

AI_DEBUG_LOG_CONFIG_KEY = "ai.debug_log.enabled"
AI_DEBUG_LOG_PATH = Path("var/logs/ai_debug.log")
MAX_AI_DEBUG_LOG_BYTES = 10 * 1024 * 1024


def is_ai_debug_log_enabled() -> bool:
    db = SessionLocal()
    try:
        config = db.query(SystemConfig).filter(SystemConfig.config_key == AI_DEBUG_LOG_CONFIG_KEY).one_or_none()
        if config is None or not config.enabled:
            return False
        return config.config_value.strip().lower() == "true"
    finally:
        db.close()


def _rotate_if_needed(log_path: Path) -> None:
    if not log_path.exists() or log_path.stat().st_size < MAX_AI_DEBUG_LOG_BYTES:
        return

    first_archive = log_path.with_name(f"{log_path.name}.1")
    second_archive = log_path.with_name(f"{log_path.name}.2")
    if second_archive.exists():
        second_archive.unlink()
    if first_archive.exists():
        first_archive.replace(second_archive)
    log_path.replace(first_archive)


def write_ai_debug_log(
    *,
    provider: str,
    model: str,
    task_name: str,
    endpoint: str,
    request_payload: dict,
    raw_response: str | None = None,
    parsed_response: dict | list | None = None,
    status: str,
    duration_ms: int,
    error_message: str | None = None,
    request_id: str | None = None,
) -> None:
    if not is_ai_debug_log_enabled():
        return

    log_path = AI_DEBUG_LOG_PATH
    log_path.parent.mkdir(parents=True, exist_ok=True)
    _rotate_if_needed(log_path)
    entry = {
        "request_id": request_id or str(uuid4()),
        "created_at": utc_now().isoformat(),
        "provider": provider,
        "model": model,
        "task_name": task_name,
        "endpoint": endpoint,
        "request_payload": request_payload,
        "raw_response": raw_response,
        "parsed_response": parsed_response,
        "status": status,
        "duration_ms": duration_ms,
        "error_message": error_message,
    }
    with log_path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(entry, ensure_ascii=False, default=str, indent=2) + "\n\n")
