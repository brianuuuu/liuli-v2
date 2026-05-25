from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.ai_audit.models import AiRequestLog


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


def list_ai_request_logs(db: Session, limit: int = 100) -> list[AiRequestLog]:
    return list(db.scalars(select(AiRequestLog).order_by(AiRequestLog.created_at.desc(), AiRequestLog.id.desc()).limit(limit)))
