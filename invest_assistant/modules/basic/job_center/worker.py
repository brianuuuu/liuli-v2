import time

from sqlalchemy import select

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.dispatcher import execute_job
from invest_assistant.modules.basic.job_center.models import JobRunRequest
from invest_assistant.shared.db_types import loads_json
from invest_assistant.shared.time_utils import utc_now


def run_once() -> bool:
    db = SessionLocal()
    try:
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


def run_worker(poll_seconds: int = 5) -> None:
    while True:
        did_work = run_once()
        if not did_work:
            time.sleep(poll_seconds)
