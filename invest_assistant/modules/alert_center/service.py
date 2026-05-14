from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.alert_center.models import AlertEvent, AlertRule
from invest_assistant.modules.alert_center.schemas import AlertEventCreate, AlertRuleCreate
from invest_assistant.modules.basic.job_center.types import JobResult


def create_rule(db: Session, payload: AlertRuleCreate, user_id: int | None) -> AlertRule:
    item = AlertRule(**payload.model_dump(), user_id=user_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_rules(db: Session) -> list[AlertRule]:
    return list(db.scalars(select(AlertRule).order_by(AlertRule.id.desc())))


def create_event(db: Session, payload: AlertEventCreate) -> AlertEvent:
    item = AlertEvent(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_events(db: Session) -> list[AlertEvent]:
    return list(db.scalars(select(AlertEvent).order_by(AlertEvent.event_time.desc(), AlertEvent.id.desc())))


def get_event(db: Session, event_id: int) -> AlertEvent | None:
    return db.get(AlertEvent, event_id)


def mark_event(db: Session, event: AlertEvent, status: str) -> AlertEvent:
    event.status = status
    db.commit()
    db.refresh(event)
    return event


def evaluate_rules(db: Session) -> JobResult:
    rules = list(db.scalars(select(AlertRule).where(AlertRule.enabled.is_(True))))
    return JobResult(success=True, message=f"evaluated {len(rules)} alert rules", processed_count=len(rules))
