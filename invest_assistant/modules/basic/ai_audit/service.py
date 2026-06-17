from datetime import date, datetime, time, timedelta
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.shared.pagination import Page, make_page, normalize_limit, normalize_offset
from invest_assistant.shared.time_utils import beijing_now


def create_ai_request_log(
    db: Session,
    *,
    provider: str,
    model: str,
    task_name: str,
    status: str,
    duration_ms: int,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    error_message: str | None = None,
) -> AiRequestLog:
    item = AiRequestLog(
        request_id=str(uuid4()),
        provider=provider,
        model=model,
        task_name=task_name,
        status=status,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        duration_ms=duration_ms,
        error_message=error_message,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_ai_request_logs(db: Session, limit: int = 20) -> list[AiRequestLog]:
    return list(
        db.scalars(select(AiRequestLog).order_by(AiRequestLog.created_at.desc(), AiRequestLog.id.desc()).limit(limit))
    )


def list_ai_request_logs_page(db: Session, limit: int | None = 50, offset: int = 0) -> Page[AiRequestLog]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    stmt = select(AiRequestLog).order_by(AiRequestLog.created_at.desc(), AiRequestLog.id.desc())
    total = int(db.scalar(select(func.count()).select_from(AiRequestLog)) or 0)
    items = list(db.scalars(stmt.limit(safe_limit).offset(safe_offset)))
    return make_page(items, total, safe_limit, safe_offset)


def count_ai_request_logs(db: Session, target_date: date | None = None) -> dict[str, int]:
    day = target_date or beijing_now().date()
    start_at = datetime.combine(day, time.min)
    end_at = start_at + timedelta(days=1)
    total = int(db.scalar(select(func.count()).select_from(AiRequestLog)) or 0)
    today_count, today_tokens = db.execute(
        select(func.count(AiRequestLog.id), func.coalesce(func.sum(AiRequestLog.total_tokens), 0)).where(
            AiRequestLog.created_at >= start_at,
            AiRequestLog.created_at < end_at,
        )
    ).one()
    return {
        "total": total,
        "today": int(today_count or 0),
        "today_tokens": int(today_tokens or 0),
    }
