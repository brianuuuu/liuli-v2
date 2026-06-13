from __future__ import annotations

from datetime import date, datetime, time, timedelta
from pathlib import Path
from time import perf_counter
from typing import Any

from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.ai_audit.service import create_ai_request_log
from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.service import get_active_prompt_by_key
from invest_assistant.modules.market_radar.models import (
    Hotword,
    HotwordTagRelation,
    SourceItem,
    SourceTag,
    StockTagRelation,
    Tag,
    TrackTagRelation,
)
from invest_assistant.modules.track_discovery.models import Track
from invest_assistant.services.deepseek import client as deepseek_client
from invest_assistant.shared.time_utils import BEIJING_TZ, beijing_now

DAILY_REPORT_JOB_NAME = "market_radar.generate_daily_report"
DEFAULT_DAILY_REPORT_MODEL = "deepseek-v4-pro"


def default_report_date(now: datetime | None = None) -> date:
    current = now or beijing_now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=BEIJING_TZ)
    return current.astimezone(BEIJING_TZ).date() - timedelta(days=1)


def build_daily_report_payload(
    db: Session,
    report_date: date,
) -> dict[str, Any]:
    window_start, window_end_exclusive = _window_bounds(report_date)
    hot_tags = []
    hot_tags.extend(
        _rank_entities(
            db,
            report_date,
            tag_type="stock",
            limit=5,
            relation_model=StockTagRelation,
            entity_model=Stock,
            relation_entity_field="stock_id",
            entity_name_field="stock_name",
        )
    )
    hot_tags.extend(
        _rank_entities(
            db,
            report_date,
            tag_type="track",
            limit=5,
            relation_model=TrackTagRelation,
            entity_model=Track,
            relation_entity_field="track_id",
            entity_name_field="name",
        )
    )
    hot_tags.extend(
        _rank_entities(
            db,
            report_date,
            tag_type="hotword",
            limit=10,
            relation_model=HotwordTagRelation,
            entity_model=Hotword,
            relation_entity_field="hotword_id",
            entity_name_field="name",
        )
    )
    return {
        "report_meta": {
            "report_date": report_date.isoformat(),
            "window_start": _iso_beijing(window_start),
            "window_end": _iso_beijing(window_end_exclusive - timedelta(seconds=1)),
        },
        "hot_tags": hot_tags,
    }


def generate_daily_report(
    db: Session,
    *,
    report_date: date | None = None,
    model: str | None = None,
    reports_root: Path | str = Path("var") / "reports",
    deepseek=deepseek_client,
) -> JobResult:
    target_date = report_date or default_report_date()
    payload = build_daily_report_payload(db, target_date)
    source_item_count = sum(len(item["related_source_items"]) for item in payload["hot_tags"])
    if not payload["hot_tags"] or source_item_count <= 0:
        return JobResult(
            success=True,
            message="no hot tags or related source items for report date",
            skipped_count=1,
            extra={"report_date": target_date.isoformat(), "hot_tags_count": len(payload["hot_tags"])},
        )

    prompt = get_active_prompt_by_key(
        db,
        DAILY_REPORT_JOB_NAME,
        variables={
            "report_date": payload["report_meta"]["report_date"],
            "window_start": payload["report_meta"]["window_start"],
            "window_end": payload["report_meta"]["window_end"],
        },
    )
    active_model = model or getattr(prompt, "model", None) or DEFAULT_DAILY_REPORT_MODEL
    if prompt is None:
        message = f"active prompt not found: {DAILY_REPORT_JOB_NAME}"
        create_ai_request_log(
            db,
            provider="deepseek",
            model=active_model,
            task_name=DAILY_REPORT_JOB_NAME,
            status="failed",
            duration_ms=0,
            error_message=message,
        )
        return JobResult(success=False, message=message, processed_count=source_item_count)

    started = perf_counter()
    try:
        response = deepseek.generate_market_daily_report(payload, prompt, active_model)
    except Exception as exc:
        create_ai_request_log(
            db,
            provider="deepseek",
            model=active_model,
            task_name=DAILY_REPORT_JOB_NAME,
            status="failed",
            duration_ms=int((perf_counter() - started) * 1000),
            error_message=str(exc),
        )
        return JobResult(success=False, message=str(exc), processed_count=source_item_count)

    usage = response.get("usage") or {}
    create_ai_request_log(
        db,
        provider="deepseek",
        model=active_model,
        task_name=DAILY_REPORT_JOB_NAME,
        status="success",
        duration_ms=int((perf_counter() - started) * 1000),
        prompt_tokens=int(usage.get("prompt_tokens") or 0),
        completion_tokens=int(usage.get("completion_tokens") or 0),
        total_tokens=int(usage.get("total_tokens") or 0),
    )

    markdown = str(response.get("content") or "").strip()
    if not markdown:
        return JobResult(success=False, message="DeepSeek returned empty daily report", processed_count=source_item_count)

    file_path = _write_report_file(markdown, target_date, Path(reports_root))
    report = _create_report_index(db, target_date, markdown, file_path)
    return JobResult(
        success=True,
        message=f"generated market radar daily report for {target_date.isoformat()}",
        processed_count=source_item_count,
        inserted_count=1,
        extra={
            "report_date": target_date.isoformat(),
            "report_id": report.id,
            "file_path": report.file_path,
            "model": active_model,
            "hot_tags_count": len(payload["hot_tags"]),
            "source_item_count": source_item_count,
        },
    )


def _window_bounds(report_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(report_date, time.min).replace(tzinfo=BEIJING_TZ)
    return start, start + timedelta(days=1)


def _db_window_bounds(report_date: date) -> tuple[datetime, datetime]:
    start, end = _window_bounds(report_date)
    return start.replace(tzinfo=None), end.replace(tzinfo=None)


def _window_condition(report_date: date):
    start, end = _db_window_bounds(report_date)
    return or_(
        and_(SourceItem.publish_time >= start, SourceItem.publish_time < end),
        and_(SourceItem.publish_time.is_(None), SourceItem.created_at >= start, SourceItem.created_at < end),
    )


def _tag_stats(db: Session, report_date: date) -> dict[int, dict[str, float | int]]:
    rows = db.execute(
        select(SourceTag.tag_id, func.count(SourceTag.id), func.count(distinct(SourceTag.source_item_id)))
        .join(SourceItem, SourceItem.id == SourceTag.source_item_id)
        .where(_window_condition(report_date))
        .group_by(SourceTag.tag_id)
    ).all()
    return {
        int(tag_id): {
            "trigger_count": int(trigger_count or 0),
            "source_count": int(source_count or 0),
            "heat_score": float(trigger_count or 0),
        }
        for tag_id, trigger_count, source_count in rows
    }


def _rank_entities(
    db: Session,
    report_date: date,
    *,
    tag_type: str,
    limit: int,
    relation_model,
    entity_model,
    relation_entity_field: str,
    entity_name_field: str,
) -> list[dict[str, Any]]:
    stats_by_tag = _tag_stats(db, report_date)
    if not stats_by_tag:
        return []
    relation_entity_column = getattr(relation_model, relation_entity_field)
    entity_name_column = getattr(entity_model, entity_name_field)
    rows = db.execute(
        select(relation_model.tag_id, relation_entity_column, entity_name_column, Tag.name)
        .join(entity_model, entity_model.id == relation_entity_column)
        .join(Tag, Tag.id == relation_model.tag_id)
        .where(
            relation_model.status != "disabled",
            entity_model.status != "disabled",
            Tag.status != "disabled",
            Tag.type == tag_type,
            relation_model.tag_id.in_(stats_by_tag.keys()),
        )
    ).all()

    best_by_entity: dict[int, dict[str, Any]] = {}
    for tag_id, entity_id, entity_name, tag_name in rows:
        stats = stats_by_tag.get(int(tag_id))
        if not stats:
            continue
        candidate = {
            "tag_id": int(tag_id),
            "tag_name": str(tag_name),
            "tag_type": tag_type,
            "entity_id": int(entity_id),
            "entity_name": str(entity_name),
            "heat_score": stats["heat_score"],
            "source_count": stats["source_count"],
            "trigger_count": stats["trigger_count"],
        }
        current = best_by_entity.get(int(entity_id))
        if current is None or _entity_sort_key(candidate) < _entity_sort_key(current):
            best_by_entity[int(entity_id)] = candidate

    ranked = sorted(best_by_entity.values(), key=_entity_sort_key)[:limit]
    result = []
    for rank, item in enumerate(ranked, start=1):
        result.append(
            {
                "rank": rank,
                "tag_id": item["tag_id"],
                "tag_name": item["tag_name"],
                "tag_type": item["tag_type"],
                "related_source_items": _related_source_items(
                    db,
                    int(item["tag_id"]),
                    report_date,
                ),
            }
        )
    return result


def _entity_sort_key(item: dict[str, Any]) -> tuple:
    return (-float(item["heat_score"]), -int(item["source_count"]), str(item["entity_name"]), int(item["entity_id"]))


def _related_source_items(db: Session, tag_id: int, report_date: date) -> list[dict[str, Any]]:
    rows = list(
        db.scalars(
            select(SourceItem)
            .join(SourceTag, SourceTag.source_item_id == SourceItem.id)
            .where(SourceTag.tag_id == tag_id, _window_condition(report_date))
            .order_by(SourceItem.publish_time.desc().nullslast(), SourceItem.id.desc())
        )
    )
    return [
        {
            "source_item_id": item.id,
            "content": item.content,
            "publish_time": _iso_beijing(item.publish_time) if item.publish_time is not None else None,
        }
        for item in rows
    ]


def _iso_beijing(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=BEIJING_TZ)
    return value.astimezone(BEIJING_TZ).isoformat()


def _write_report_file(markdown: str, report_date: date, reports_root: Path) -> Path:
    folder = reports_root / "market_radar" / report_date.strftime("%Y-%m")
    folder.mkdir(parents=True, exist_ok=True)
    stem = f"market-daily-{report_date.isoformat()}"
    path = folder / f"{stem}.md"
    suffix = 2
    while path.exists():
        path = folder / f"{stem}-{suffix}.md"
        suffix += 1
    path.write_text(markdown, encoding="utf-8")
    return path


def _create_report_index(db: Session, report_date: date, markdown: str, file_path: Path) -> Report:
    title = f"市场雷达日报｜{report_date.isoformat()}"
    summary = _first_non_heading_line(markdown)
    _window_start, window_end_exclusive = _window_bounds(report_date)
    item = Report(
        title=title,
        report_type="daily",
        source_module="market_radar",
        target_type="market_daily",
        target_id=None,
        summary=summary,
        file_format="md",
        file_path=file_path.relative_to(Path("var")).as_posix(),
        generated_by="ai",
        status="published",
        publish_time=window_end_exclusive - timedelta(seconds=1),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _first_non_heading_line(markdown: str) -> str | None:
    for line in markdown.splitlines():
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        return value[:500]
    return None
