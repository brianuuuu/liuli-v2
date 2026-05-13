from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunLog, JobRunRequest
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY
from invest_assistant.modules.basic.job_center.schemas import JobConfigUpdate
from invest_assistant.shared.db_types import dumps_json


def sync_job_definitions(db: Session) -> int:
    count = 0
    for definition in JOB_REGISTRY.values():
        config = db.scalar(select(JobConfig).where(JobConfig.job_name == definition.job_name))
        if config is None:
            config = JobConfig(job_name=definition.job_name, module_name=definition.module_name)
            db.add(config)
        config.display_name = definition.display_name
        config.description = definition.description
        config.trigger_type = definition.trigger_type
        config.cron_expr = definition.cron_expr
        config.enabled = definition.enabled
        config.timeout_seconds = definition.timeout_seconds
        config.max_retries = definition.max_retries
        count += 1
    db.commit()
    return count


def list_job_configs(db: Session) -> list[JobConfig]:
    return list(db.scalars(select(JobConfig).order_by(JobConfig.module_name.asc(), JobConfig.job_name.asc())))


def get_job_config(db: Session, job_name: str) -> JobConfig | None:
    return db.scalar(select(JobConfig).where(JobConfig.job_name == job_name))


def update_job_config(db: Session, config: JobConfig, payload: JobConfigUpdate) -> JobConfig:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, key, value)
    db.commit()
    db.refresh(config)
    return config


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
