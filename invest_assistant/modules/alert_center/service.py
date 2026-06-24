from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from invest_assistant.modules.alert_center.models import AlertEvent, AlertRule
from invest_assistant.modules.alert_center.schemas import AlertRuleCreate
from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunLog
from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.market_radar.models import Tag, TagHeatSnapshot
from invest_assistant.shared.db_types import loads_json
from invest_assistant.shared.pagination import Page, page_from_statement


def create_rule(db: Session, payload: AlertRuleCreate, user_id: int | None) -> AlertRule:
    item = AlertRule(**payload.model_dump(), user_id=user_id, status="active")
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_rules(db: Session) -> list[AlertRule]:
    return list(db.scalars(select(AlertRule).where(AlertRule.status == "active").order_by(AlertRule.id.desc())))


def list_events(db: Session) -> list[AlertEvent]:
    return list(db.scalars(select(AlertEvent).order_by(AlertEvent.event_time.desc(), AlertEvent.id.desc())))


def list_events_page(db: Session, limit: int | None = 50, offset: int = 0) -> Page[AlertEvent]:
    stmt = select(AlertEvent).order_by(AlertEvent.event_time.desc(), AlertEvent.id.desc())
    return page_from_statement(db, stmt, limit=limit, offset=offset)


def event_stats(db: Session) -> dict[str, int]:
    rows = db.execute(select(AlertEvent.status, func.count(AlertEvent.id)).group_by(AlertEvent.status)).all()
    stats = {"total": 0, "unread": 0, "read": 0, "handled": 0}
    for status, count in rows:
        value = int(count or 0)
        stats["total"] += value
        if status in stats:
            stats[str(status)] += value
    stats["unhandled"] = stats["unread"] + stats["read"]
    return stats


def get_event(db: Session, event_id: int) -> AlertEvent | None:
    return db.get(AlertEvent, event_id)


def mark_event(db: Session, event: AlertEvent, status: str) -> AlertEvent:
    event.status = status
    db.commit()
    db.refresh(event)
    return event


def delete_event(db: Session, event: AlertEvent) -> None:
    db.delete(event)
    db.commit()


def mark_all_unread_events_read(db: Session) -> int:
    result = db.execute(update(AlertEvent).where(AlertEvent.status == "unread").values(status="read"))
    db.commit()
    return int(result.rowcount or 0)


def set_rule_enabled(db: Session, rule: AlertRule, enabled: bool) -> AlertRule:
    rule.enabled = enabled
    db.commit()
    db.refresh(rule)
    return rule


def delete_rule(db: Session, rule: AlertRule) -> AlertRule:
    rule.status = "deleted"
    rule.enabled = False
    db.commit()
    db.refresh(rule)
    return rule


def evaluate_rules(db: Session) -> JobResult:
    rules = list(db.scalars(select(AlertRule).where(AlertRule.enabled.is_(True), AlertRule.status == "active")))
    inserted = 0
    skipped = 0
    for rule in rules:
        events = _evaluate_rule(db, rule)
        if not events:
            skipped += 1
            continue
        for event in events:
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


def _evaluate_rule(db: Session, rule: AlertRule) -> list[AlertEvent]:
    if rule.rule_type == "heat":
        event = _evaluate_heat_rule(db, rule)
        return [event] if event is not None else []
    if rule.rule_type == "job_failure":
        return _evaluate_job_failure_rule(db, rule)
    return []


def _evaluate_heat_rule(db: Session, rule: AlertRule) -> AlertEvent | None:
    if rule.target_id is None:
        return None
    condition = loads_json(rule.condition_json) or {}
    window = str(condition.get("window") or "24h")
    min_heat = float(condition.get("min_heat") or 0)
    min_rank_change = condition.get("min_rank_change")
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
    rank_change = _snapshot_rank_change(db, snapshot)
    if min_rank_change is not None:
        if rank_change is None or rank_change < int(min_rank_change):
            return None
    if min_trigger_count is not None and snapshot.trigger_count < int(min_trigger_count):
        return None

    title = f"{tag.name} 热度达到 {snapshot.heat_score:.1f}"
    if _has_open_event(db, rule.id, title):
        return None
    message = (
        f"{tag.name} 在 {window} 窗口热度 {snapshot.heat_score:.1f}，"
        f"标签命中 {snapshot.trigger_count} 次，排名 {snapshot.rank_no}。"
    )
    if rank_change is not None:
        message = f"{message[:-1]}，排名变化 {rank_change:+d}。"
    return AlertEvent(
        rule_id=rule.id,
        event_level=str(condition.get("event_level") or "warning"),
        title=title,
        message=message,
        status="unread",
    )


def _evaluate_job_failure_rule(db: Session, rule: AlertRule) -> list[AlertEvent]:
    condition = loads_json(rule.condition_json) or {}
    job_name = str(condition.get("job_name") or "").strip()
    min_log_id = int(condition.get("min_log_id") or 0)
    stmt = select(JobRunLog).where(JobRunLog.status.in_(("failed", "error"))).order_by(JobRunLog.finished_at.asc(), JobRunLog.id.asc())
    if min_log_id > 0:
        stmt = stmt.where(JobRunLog.id > min_log_id)
    if job_name:
        stmt = stmt.where(JobRunLog.job_name == job_name)
    rows = list(db.scalars(stmt))
    if not rows:
        return []
    configs = {
        item.job_name: item
        for item in db.scalars(select(JobConfig).where(JobConfig.job_name.in_({row.job_name for row in rows})))
    }
    events = []
    for log in rows:
        title = f"任务失败：{configs.get(log.job_name).display_name if log.job_name in configs else log.job_name} #{log.id}"
        if _has_event(db, rule.id, title):
            continue
        error_text = str(log.error_message or "任务返回失败状态").strip()
        message = (
            f"任务 {log.job_name} 在 {log.finished_at.isoformat()} 执行失败。"
            f"触发方式：{log.trigger_type}。错误：{error_text}"
        )
        events.append(
            AlertEvent(
                rule_id=rule.id,
                event_level=str(condition.get("event_level") or "warning"),
                title=title,
                message=message,
                status="unread",
            )
        )
    return events


def _snapshot_rank_change(db: Session, snapshot: TagHeatSnapshot) -> int | None:
    previous_stat = db.scalar(
        select(TagHeatSnapshot.stat_time)
        .where(
            TagHeatSnapshot.window_type == snapshot.window_type,
            TagHeatSnapshot.stat_time < snapshot.stat_time,
        )
        .distinct()
        .order_by(TagHeatSnapshot.stat_time.desc())
        .limit(1)
    )
    if previous_stat is None:
        return None
    previous_rank = db.scalar(
        select(TagHeatSnapshot.rank_no).where(
            TagHeatSnapshot.tag_id == snapshot.tag_id,
            TagHeatSnapshot.window_type == snapshot.window_type,
            TagHeatSnapshot.stat_time == previous_stat,
        )
    )
    if previous_rank is None:
        return None
    return int(previous_rank) - int(snapshot.rank_no)


def _has_open_event(db: Session, rule_id: int, title: str) -> bool:
    existing = db.scalar(
        select(AlertEvent.id).where(
            AlertEvent.rule_id == rule_id,
            AlertEvent.title == title,
            AlertEvent.status.in_(("unread", "read")),
        )
    )
    return existing is not None


def _has_event(db: Session, rule_id: int, title: str) -> bool:
    existing = db.scalar(
        select(AlertEvent.id).where(
            AlertEvent.rule_id == rule_id,
            AlertEvent.title == title,
        )
    )
    return existing is not None
