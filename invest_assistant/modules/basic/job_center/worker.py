import time
from datetime import datetime, timedelta

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import SessionLocal, create_all_tables
from invest_assistant.modules.basic.job_center.dispatcher import execute_job
from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunRequest
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY
from invest_assistant.modules.basic.job_center.scheduler import build_job_scheduler
from invest_assistant.modules.basic.job_center.service import sync_job_definitions
from invest_assistant.shared.db_types import loads_json
from invest_assistant.shared.time_utils import BEIJING_TZ, utc_now

SCHEDULE_JOB_PREFIX = "job-center:"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 300


def _scheduled_job_id(job_name: str) -> str:
    return f"{SCHEDULE_JOB_PREFIX}{job_name}"


def _schedule_signature(config: JobConfig) -> str | None:
    runtime_config = config.config_json
    cron_expr = runtime_config.get("cron_expr")
    if (
        runtime_config.get("enabled") is not True
        or runtime_config.get("execution_mode") != "schedule"
        or not isinstance(cron_expr, str)
        or not cron_expr.strip()
    ):
        return None
    return cron_expr.strip()


def execute_scheduled_job(job_name: str) -> None:
    db = SessionLocal()
    try:
        execute_job(db, job_name, {}, "schedule")
    finally:
        db.close()


def _as_beijing(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=BEIJING_TZ)
    return value.astimezone(BEIJING_TZ)


def _request_timeout_seconds(configs: dict[str, JobConfig], job_name: str) -> int:
    config = configs.get(job_name)
    if config is None:
        return DEFAULT_REQUEST_TIMEOUT_SECONDS
    try:
        return max(int(config.config_json.get("timeout_seconds") or DEFAULT_REQUEST_TIMEOUT_SECONDS), 1)
    except (TypeError, ValueError):
        return DEFAULT_REQUEST_TIMEOUT_SECONDS


def recover_stale_running_requests(db: Session) -> int:
    running_requests = list(db.scalars(select(JobRunRequest).where(JobRunRequest.status == "running")))
    if not running_requests:
        return 0
    configs = {config.job_name: config for config in db.scalars(select(JobConfig))}
    now = utc_now()
    recovered = 0
    for request in running_requests:
        if request.started_at is None:
            continue
        timeout_seconds = _request_timeout_seconds(configs, request.job_name)
        if now - _as_beijing(request.started_at) <= timedelta(seconds=timeout_seconds):
            continue
        request.status = "failed"
        request.finished_at = now
        request.error_message = f"worker interrupted or timed out after {timeout_seconds} seconds"
        recovered += 1
    if recovered:
        db.commit()
    return recovered


def sync_scheduled_jobs(scheduler, db: Session) -> None:
    configs = list(db.scalars(select(JobConfig)))
    expected_job_ids = set()
    for config in configs:
        if config.job_name not in JOB_REGISTRY:
            continue
        cron_expr = _schedule_signature(config)
        if cron_expr is None:
            continue
        job_id = _scheduled_job_id(config.job_name)
        expected_job_ids.add(job_id)
        existing_job = scheduler.get_job(job_id)
        if existing_job is not None and existing_job.name == cron_expr:
            continue
        if existing_job is not None:
            scheduler.remove_job(job_id)
        try:
            trigger = CronTrigger.from_crontab(cron_expr, timezone=scheduler.timezone)
        except ValueError:
            continue
        scheduler.add_job(
            execute_scheduled_job,
            trigger,
            id=job_id,
            name=cron_expr,
            kwargs={"job_name": config.job_name},
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=60,
        )

    for job in scheduler.get_jobs():
        if job.id.startswith(SCHEDULE_JOB_PREFIX) and job.id not in expected_job_ids:
            scheduler.remove_job(job.id)


def initialize_worker() -> object:
    create_all_tables()
    db = SessionLocal()
    try:
        sync_job_definitions(db)
        scheduler = build_job_scheduler()
        sync_scheduled_jobs(scheduler, db)
        scheduler.start()
        return scheduler
    finally:
        db.close()


def run_once() -> bool:
    db = SessionLocal()
    try:
        recover_stale_running_requests(db)
        request = db.scalar(
            select(JobRunRequest).where(JobRunRequest.status == "pending").order_by(JobRunRequest.requested_at.asc())
        )
        if request is None:
            return False
        request.status = "running"
        request.started_at = utc_now()
        db.commit()
        try:
            result = execute_job(db, request.job_name, loads_json(request.params_json) or {}, "manual")
            request.status = "success" if result.success else "failed"
            request.error_message = None if result.success else result.message
        except Exception as exc:
            request.status = "failed"
            request.error_message = str(exc)
        request.finished_at = utc_now()
        db.commit()
        return True
    finally:
        db.close()


def run_worker(poll_seconds: int = 5, schedule_sync_seconds: int = 30) -> None:
    scheduler = initialize_worker()
    last_schedule_sync = 0.0
    while True:
        now = time.monotonic()
        if now - last_schedule_sync >= schedule_sync_seconds:
            db = SessionLocal()
            try:
                sync_scheduled_jobs(scheduler, db)
            finally:
                db.close()
            last_schedule_sync = now
        did_work = run_once()
        if not did_work:
            time.sleep(poll_seconds)
