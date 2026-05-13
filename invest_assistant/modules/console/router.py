from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/console", tags=["console"], dependencies=[Depends(get_current_user)])


@router.get("/dashboard")
def dashboard() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/system-status")
def system_status(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"api": "ok", "database": "ok"}


@router.get("/data-sources")
def data_sources() -> list[dict[str, str]]:
    return []


@router.get("/ai-logs")
def ai_logs() -> list[dict[str, str]]:
    return []
