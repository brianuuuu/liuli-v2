from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.basic.job_center import service
from invest_assistant.modules.basic.job_center.schemas import (
    JobConfigRead,
    JobConfigUpdate,
    JobRunCreate,
    JobRunLogRead,
    JobRunRequestRead,
)
from invest_assistant.shared.pagination import Page

router = APIRouter(prefix="/api/jobs", tags=["job_center"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[JobConfigRead])
def list_jobs(db: Session = Depends(get_db)) -> list:
    return service.list_job_configs(db)


@router.post("/sync-definitions")
def sync_definitions(db: Session = Depends(get_db)) -> dict[str, int]:
    return {"synced": service.sync_job_definitions(db)}


@router.get("/run-requests", response_model=Page[JobRunRequestRead])
def list_run_requests(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Page[JobRunRequestRead]:
    return service.list_run_requests_page(db, limit=limit, offset=offset)


@router.get("/{job_name}", response_model=JobConfigRead)
def get_job(job_name: str, db: Session = Depends(get_db)):
    config = service.get_job_config(db, job_name)
    if config is None:
        raise HTTPException(status_code=404, detail="job not found")
    return config


@router.put("/{job_name}", response_model=JobConfigRead)
def update_job(job_name: str, payload: JobConfigUpdate, db: Session = Depends(get_db)):
    config = service.get_job_config(db, job_name)
    if config is None:
        raise HTTPException(status_code=404, detail="job not found")
    return service.update_job_config(db, config, payload)


@router.post("/{job_name}/run", response_model=JobRunRequestRead)
def run_job(
    job_name: str,
    payload: JobRunCreate,
    db: Session = Depends(get_db),
    user: UserAccount = Depends(get_current_user),
):
    try:
        return service.create_run_request(db, job_name, payload.params, user.id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="job definition not found") from exc


@router.get("/{job_name}/logs", response_model=Page[JobRunLogRead])
def list_logs(
    job_name: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Page[JobRunLogRead]:
    return service.list_job_logs_page(db, job_name, limit=limit, offset=offset)
