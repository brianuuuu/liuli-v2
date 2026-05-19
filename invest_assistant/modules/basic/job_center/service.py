from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunLog, JobRunRequest
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY
from invest_assistant.modules.basic.job_center.schemas import JobConfigUpdate
from invest_assistant.modules.basic.job_center.types import JobDefinition
from invest_assistant.shared.db_types import dumps_json


def _schedule_kind_from_cron(cron_expr: str | None) -> str:
    if not cron_expr:
        return "daily"
    parts = cron_expr.split()
    if len(parts) == 5 and parts[2:] == ["*", "*", "*"]:
        if parts[0].startswith("*/") and parts[1] == "*":
            return "interval"
        if parts[0].isdigit() and parts[1].isdigit():
            return "daily"
    return "custom"


def _run_time_from_cron(cron_expr: str | None) -> str:
    parts = cron_expr.split() if cron_expr else []
    if len(parts) == 5 and parts[0].isdigit() and parts[1].isdigit():
        return f"{int(parts[1]):02d}:{int(parts[0]):02d}"
    return "08:00"


def _cron_from_runtime_config(config: dict) -> str | None:
    if config.get("execution_mode") != "schedule":
        return None
    if config.get("schedule_kind") == "daily":
        hour, minute = str(config.get("run_time") or "08:00").split(":", 1)
        return f"{int(minute)} {int(hour)} * * *"
    cron_expr = config.get("cron_expr")
    return str(cron_expr) if cron_expr else None


def _runtime_config_from_values(
    enabled: bool,
    trigger_type: str,
    cron_expr: str | None,
    timeout_seconds: int,
    max_retries: int,
) -> dict:
    has_schedule = bool(cron_expr) or trigger_type in {"schedule", "both", "cron"}
    return {
        "enabled": bool(enabled),
        "execution_mode": "schedule" if has_schedule else "manual",
        "schedule_kind": _schedule_kind_from_cron(cron_expr),
        "run_time": _run_time_from_cron(cron_expr),
        "cron_expr": cron_expr,
        "allow_manual_run": trigger_type in {"manual", "both"},
        "timeout_seconds": int(timeout_seconds),
        "max_retries": int(max_retries),
    }


def _default_runtime_config(definition: JobDefinition) -> dict:
    return _runtime_config_from_values(
        definition.enabled,
        definition.trigger_type,
        definition.cron_expr,
        definition.timeout_seconds,
        definition.max_retries,
    )


def _normalize_config_json(config_json: dict) -> dict:
    normalized = {
        "enabled": config_json.get("enabled") is True,
        "execution_mode": config_json.get("execution_mode") or "manual",
        "schedule_kind": config_json.get("schedule_kind") or "daily",
        "run_time": config_json.get("run_time") or "08:00",
        "cron_expr": config_json.get("cron_expr"),
        "allow_manual_run": config_json.get("allow_manual_run") is True,
        "timeout_seconds": int(config_json.get("timeout_seconds") or 300),
        "max_retries": int(config_json.get("max_retries") or 0),
    }
    normalized["cron_expr"] = _cron_from_runtime_config(normalized)
    return normalized


def _attach_definition_metadata(config: JobConfig) -> JobConfig:
    definition = JOB_REGISTRY.get(config.job_name)
    config.params_schema = definition.params_schema if definition else None
    return config


def sync_job_definitions(db: Session) -> int:
    count = 0
    for definition in JOB_REGISTRY.values():
        config = db.scalar(select(JobConfig).where(JobConfig.job_name == definition.job_name))
        if config is None:
            config = JobConfig(job_name=definition.job_name, module_name=definition.module_name)
            db.add(config)
            config.config_json = _normalize_config_json(_default_runtime_config(definition))
            config.ext_json = {}
        config.module_name = definition.module_name
        config.display_name = definition.display_name
        config.description = definition.description
        if not config.config_json:
            config.config_json = _normalize_config_json(_default_runtime_config(definition))
        count += 1
    db.commit()
    return count


def list_job_configs(db: Session) -> list[JobConfig]:
    configs = list(db.scalars(select(JobConfig).order_by(JobConfig.module_name.asc(), JobConfig.job_name.asc())))
    return [_attach_definition_metadata(config) for config in configs]


def get_job_config(db: Session, job_name: str) -> JobConfig | None:
    config = db.scalar(select(JobConfig).where(JobConfig.job_name == job_name))
    return _attach_definition_metadata(config) if config else None


def update_job_config(db: Session, config: JobConfig, payload: JobConfigUpdate) -> JobConfig:
    values = payload.model_dump(exclude_unset=True)
    if "config_json" in values:
        config.config_json = _normalize_config_json(values["config_json"] or {})
    if "ext_json" in values:
        config.ext_json = values["ext_json"] or {}
    db.commit()
    db.refresh(config)
    return _attach_definition_metadata(config)


def create_run_request(db: Session, job_name: str, params: dict, requested_by: int | None) -> JobRunRequest:
    if job_name not in JOB_REGISTRY:
        raise KeyError(job_name)
    request = JobRunRequest(job_name=job_name, params_json=dumps_json(params), requested_by=requested_by)
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def list_run_requests(db: Session) -> list[JobRunRequest]:
    return list(db.scalars(select(JobRunRequest).order_by(JobRunRequest.requested_at.desc(), JobRunRequest.id.desc())))


def list_job_logs(db: Session, job_name: str) -> list[JobRunLog]:
    return list(db.scalars(select(JobRunLog).where(JobRunLog.job_name == job_name).order_by(JobRunLog.started_at.desc())))
