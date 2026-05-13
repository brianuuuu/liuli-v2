from dataclasses import asdict
from time import perf_counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunLog
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY
from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.shared.db_types import dumps_json
from invest_assistant.shared.time_utils import utc_now


def _normalize_result(raw) -> JobResult:
    if isinstance(raw, JobResult):
        return raw
    if isinstance(raw, dict):
        return JobResult(**raw)
    return JobResult(success=True, message=str(raw))


def execute_job(db: Session, job_name: str, params: dict | None = None, trigger_type: str = "manual") -> JobResult:
    definition = JOB_REGISTRY[job_name]
    params = params or {}
    started_at = utc_now()
    start = perf_counter()
    error_message = None
    try:
        result = _normalize_result(definition.handler(**params))
    except Exception as exc:
        result = JobResult(success=False, message=str(exc))
        error_message = str(exc)
    finished_at = utc_now()
    duration_ms = int((perf_counter() - start) * 1000)
    status = "success" if result.success else "failed"
    db.add(
        JobRunLog(
            job_name=job_name,
            module_name=definition.module_name,
            trigger_type=trigger_type,
            status=status,
            params_json=dumps_json(params),
            result_json=dumps_json(asdict(result)),
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=duration_ms,
            fetched_count=result.fetched_count,
            processed_count=result.processed_count,
            inserted_count=result.inserted_count,
            updated_count=result.updated_count,
            error_message=error_message,
        )
    )
    config = db.scalar(select(JobConfig).where(JobConfig.job_name == job_name))
    if config is not None:
        config.last_run_at = finished_at
        config.last_status = status
    db.commit()
    return result
