from sqlalchemy import func, select
from sqlalchemy.orm import Session

from invest_assistant.modules.alert_center.models import AlertEvent, AlertRule
from invest_assistant.modules.alert_center.schemas import AlertEventCreate, AlertRuleCreate
from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.market_radar.models import Tag, TagHeatSnapshot
from invest_assistant.shared.db_types import loads_json


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
    inserted = 0
    skipped = 0
    for rule in rules:
        event = _evaluate_rule(db, rule)
        if event is None:
            skipped += 1
            continue
        db.add(event)
        inserted += 1
    db.commit()
    return JobResult(
        success=True,
        message=f"evaluated {len(rules)} alert rules",
        processed_count=len(rules),
        inserted_count=inserted,
        skipped_count=skipped,
    )


def _evaluate_rule(db: Session, rule: AlertRule) -> AlertEvent | None:
    if rule.rule_type == "heat":
        return _evaluate_heat_rule(db, rule)
    return None


def _evaluate_heat_rule(db: Session, rule: AlertRule) -> AlertEvent | None:
    if rule.target_id is None:
        return None
    condition = loads_json(rule.condition_json) or {}
    window = str(condition.get("window") or "24h")
    min_heat = float(condition.get("min_heat") or 0)
    min_change_ratio = condition.get("min_change_ratio")
    min_trigger_count = condition.get("min_trigger_count")

    latest_stat = db.scalar(
        select(func.max(TagHeatSnapshot.stat_time)).where(
            TagHeatSnapshot.tag_id == rule.target_id,
            TagHeatSnapshot.window_type == window,
        )
    )
    if latest_stat is None:
        return None

    row = db.execute(
        select(TagHeatSnapshot, Tag)
        .join(Tag, Tag.id == TagHeatSnapshot.tag_id)
        .where(
            TagHeatSnapshot.tag_id == rule.target_id,
            TagHeatSnapshot.window_type == window,
            TagHeatSnapshot.stat_time == latest_stat,
        )
    ).first()
    if row is None:
        return None
    snapshot, tag = row
    if tag.type != rule.target_type:
        return None
    if snapshot.heat_score < min_heat:
        return None
    if min_change_ratio is not None and snapshot.change_ratio < float(min_change_ratio):
        return None
    if min_trigger_count is not None and snapshot.trigger_count < int(min_trigger_count):
        return None

    title = f"{tag.name} 热度达到 {snapshot.heat_score:.1f}"
    if _has_open_event(db, rule.id, title):
        return None
    message = (
        f"{tag.name} 在 {window} 窗口热度 {snapshot.heat_score:.1f}，"
        f"触发 {snapshot.trigger_count} 次，来源 {snapshot.source_count} 个，排名 {snapshot.rank_no}。"
    )
    return AlertEvent(
        rule_id=rule.id,
        event_level=str(condition.get("event_level") or "warning"),
        title=title,
        message=message,
        status="unread",
    )


def _has_open_event(db: Session, rule_id: int, title: str) -> bool:
    existing = db.scalar(
        select(AlertEvent.id).where(
            AlertEvent.rule_id == rule_id,
            AlertEvent.title == title,
            AlertEvent.status.in_(("unread", "read")),
        )
    )
    return existing is not None
