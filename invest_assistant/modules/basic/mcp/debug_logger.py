import json
import traceback
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from invest_assistant.modules.basic.system_config.models import SystemConfig
from invest_assistant.shared.time_utils import utc_now

MCP_DEBUG_LOG_CONFIG_KEY = "mcp.debug_log.enabled"
MCP_DEBUG_LOG_PATH = Path("var/logs/mcp_debug.log")
MAX_MCP_DEBUG_LOG_BYTES = 10 * 1024 * 1024
MCP_DEBUG_LOG_BACKUP_COUNT = 5
SENSITIVE_KEYWORDS = ("authorization", "token", "secret", "password", "api_key", "apikey", "access_token", "bearer")


def is_mcp_debug_log_enabled(db: Session | None) -> bool:
    if db is None:
        return True
    config = db.query(SystemConfig).filter(SystemConfig.config_key == MCP_DEBUG_LOG_CONFIG_KEY).one_or_none()
    if config is None:
        return True
    if not config.enabled:
        return False
    return config.config_value.strip().lower() == "true"


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower()
    return any(keyword in normalized for keyword in SENSITIVE_KEYWORDS)


def sanitize_for_log(value):
    if isinstance(value, dict):
        return {key: "***" if _is_sensitive_key(str(key)) else sanitize_for_log(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_for_log(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_for_log(item) for item in value]
    if isinstance(value, str) and value.lower().startswith("bearer "):
        return "***"
    return value


def _rotate_if_needed(log_path: Path, max_bytes: int, backup_count: int) -> None:
    if not log_path.exists() or log_path.stat().st_size < max_bytes:
        return
    oldest_archive = log_path.with_name(f"{log_path.name}.{backup_count}")
    if oldest_archive.exists():
        oldest_archive.unlink()
    for index in range(backup_count - 1, 0, -1):
        source = log_path.with_name(f"{log_path.name}.{index}")
        if source.exists():
            source.replace(log_path.with_name(f"{log_path.name}.{index + 1}"))
    log_path.replace(log_path.with_name(f"{log_path.name}.1"))


def write_mcp_debug_log(
    *,
    entry: dict,
    log_path: Path = MCP_DEBUG_LOG_PATH,
    max_bytes: int = MAX_MCP_DEBUG_LOG_BYTES,
    backup_count: int = MCP_DEBUG_LOG_BACKUP_COUNT,
) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    _rotate_if_needed(log_path, max_bytes=max_bytes, backup_count=backup_count)
    payload = sanitize_for_log(
        {
            "request_id": entry.get("request_id") or str(uuid4()),
            "created_at": entry.get("created_at") or utc_now().isoformat(),
            **entry,
        }
    )
    with log_path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(payload, ensure_ascii=False, default=str, indent=2) + "\n\n")


def stack_trace_from_exception(exc: BaseException) -> str:
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))


def write_mcp_call_log(db: Session | None, entry: dict) -> None:
    if not is_mcp_debug_log_enabled(db):
        return
    write_mcp_debug_log(entry=entry)
