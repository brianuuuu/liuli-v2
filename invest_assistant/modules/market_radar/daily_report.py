from __future__ import annotations

from collections import defaultdict
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
SENTIMENT_SOURCE_TYPE = "sentiment"
# 原文按编号去重后统一放进 source_items，标签下只列编号：一条新闻命中多个标签也只发一次全文。
# 每个标签再限条数，热点扎堆的日子提示词不会无限膨胀。
DAILY_REPORT_TAG_SOURCE_LIMIT = 20
# 热度对比回看天数：当天命中数对比此前 N 天日均，给 AI 判断"突然升温"提供依据。
DAILY_REPORT_HEAT_LOOKBACK_DAYS = 7
# 舆情单独成节，不依赖是否命中热门标签。量大且重复度高，按"重要优先、新的优先"截一段，
# 正文再截短，避免一天的帖子把提示词撑爆。
DAILY_REPORT_SENTIMENT_LIMIT = 100
DAILY_REPORT_SENTIMENT_CONTENT_CHARS = 500

# tag_type, 名额, 关系表, 实体表, 关系表实体列, 实体名称列
HOT_TAG_GROUPS = (
    ("stock", 5, StockTagRelation, Stock, "stock_id", "stock_name"),
    ("track", 5, TrackTagRelation, Track, "track_id", "name"),
    ("hotword", 10, HotwordTagRelation, Hotword, "hotword_id", "name"),
)


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
    stats_by_tag = _tag_stats(db, report_date)
    ranked = []
    for tag_type, limit, relation_model, entity_model, relation_entity_field, entity_name_field in HOT_TAG_GROUPS:
        ranked.extend(
            _rank_entities(
                db,
                stats_by_tag,
                tag_type=tag_type,
                limit=limit,
                relation_model=relation_model,
                entity_model=entity_model,
                relation_entity_field=relation_entity_field,
                entity_name_field=entity_name_field,
            )
        )
    heat_history = _heat_history(db, [item["tag_id"] for item in ranked], report_date)
    sentiment_items = _sentiment_items(db, report_date)
    # 已在舆情块里的帖子不再进 source_items，标签直接引用同一个编号。
    sentiment_ids = {item["source_item_id"] for item in sentiment_items}
    source_items: dict[int, dict[str, Any]] = {}
    hot_tags = []
    for item in ranked:
        rows = _related_source_items(db, item["tag_id"], report_date)
        for row in rows:
            if row.id not in sentiment_ids and row.id not in source_items:
                source_items[row.id] = _source_item_payload(row)
        hot_tags.append(
            {
                "rank": item["rank"],
                "tag_id": item["tag_id"],
                "tag_name": item["tag_name"],
                "tag_type": item["tag_type"],
                "heat": {"today": item["trigger_count"], **heat_history[item["tag_id"]]},
                "source_item_ids": [row.id for row in rows],
            }
        )
    return {
        "report_meta": {
            "report_date": report_date.isoformat(),
            "window_start": _iso_beijing(window_start),
            "window_end": _iso_beijing(window_end_exclusive - timedelta(seconds=1)),
        },
        "previous_report": _previous_report(db, report_date),
        "hot_tags": hot_tags,
        "source_items": list(source_items.values()),
        "sentiment_items": sentiment_items,
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
    source_item_count = len(payload["source_items"])
    sentiment_count = len(payload["sentiment_items"])
    if source_item_count + sentiment_count <= 0:
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
            "sentiment_count": sentiment_count,
        },
    )


def _window_bounds(report_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(report_date, time.min).replace(tzinfo=BEIJING_TZ)
    return start, start + timedelta(days=1)


def _db_window_bounds(report_date: date) -> tuple[datetime, datetime]:
    start, end = _window_bounds(report_date)
    return start.replace(tzinfo=None), end.replace(tzinfo=None)


def _window_condition(report_date: date, days: int = 1):
    """报告日起往前共 days 个自然日（含报告日）。"""
    start, _ = _db_window_bounds(report_date - timedelta(days=days - 1))
    _, end = _db_window_bounds(report_date)
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
    stats_by_tag: dict[int, dict[str, float | int]],
    *,
    tag_type: str,
    limit: int,
    relation_model,
    entity_model,
    relation_entity_field: str,
    entity_name_field: str,
) -> list[dict[str, Any]]:
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
    return [{**item, "rank": rank} for rank, item in enumerate(ranked, start=1)]


def _entity_sort_key(item: dict[str, Any]) -> tuple:
    return (-float(item["heat_score"]), -int(item["source_count"]), str(item["entity_name"]), int(item["entity_id"]))


def _heat_history(db: Session, tag_ids: list[int], report_date: date) -> dict[int, dict[str, float | int]]:
    """此前 N 天（不含报告日）每个标签的日均命中数和出现天数。"""
    days = DAILY_REPORT_HEAT_LOOKBACK_DAYS
    daily_counts: dict[int, dict[date, int]] = defaultdict(lambda: defaultdict(int))
    if tag_ids:
        rows = db.execute(
            select(SourceTag.tag_id, SourceItem.publish_time, SourceItem.created_at)
            .join(SourceItem, SourceItem.id == SourceTag.source_item_id)
            .where(SourceTag.tag_id.in_(tag_ids), _window_condition(report_date - timedelta(days=1), days=days))
        ).all()
        for tag_id, publish_time, created_at in rows:
            daily_counts[int(tag_id)][(publish_time or created_at).date()] += 1
    return {
        tag_id: {
            f"prev_{days}d_avg": round(sum(daily_counts[tag_id].values()) / days, 1),
            f"prev_{days}d_active_days": len(daily_counts[tag_id]),
        }
        for tag_id in tag_ids
    }


def _related_source_items(db: Session, tag_id: int, report_date: date) -> list[SourceItem]:
    return list(
        db.scalars(
            select(SourceItem)
            .join(SourceTag, SourceTag.source_item_id == SourceItem.id)
            .where(SourceTag.tag_id == tag_id, _window_condition(report_date))
            .order_by(SourceItem.is_important.desc(), SourceItem.publish_time.desc().nullslast(), SourceItem.id.desc())
            .limit(DAILY_REPORT_TAG_SOURCE_LIMIT)
        )
    )


def _source_item_payload(item: SourceItem) -> dict[str, Any]:
    return {
        "source_item_id": item.id,
        "source_type": item.source_type,
        "content": item.content,
        "publish_time": _iso_beijing(item.publish_time) if item.publish_time is not None else None,
    }


def _previous_report(db: Session, report_date: date) -> dict[str, Any] | None:
    """前一天日报的一句话结论，让 AI 接着昨天的判断写"增强 / 削弱"。"""
    previous_date = report_date - timedelta(days=1)
    report = db.scalar(
        select(Report)
        .where(
            Report.source_module == "market_radar",
            Report.target_type == "market_daily",
            Report.status == "published",
            Report.title == _report_title(previous_date),
        )
        .order_by(Report.id.desc())
        .limit(1)
    )
    if report is None or not report.summary:
        return None
    return {"report_date": previous_date.isoformat(), "summary": report.summary.lstrip("> ").strip()}


def _sentiment_items(db: Session, report_date: date) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(SourceItem)
        .where(SourceItem.source_type == SENTIMENT_SOURCE_TYPE, _window_condition(report_date))
        .order_by(SourceItem.is_important.desc(), SourceItem.publish_time.desc().nullslast(), SourceItem.id.desc())
        .limit(DAILY_REPORT_SENTIMENT_LIMIT)
    )
    result = []
    for item in rows:
        content = item.content or ""
        result.append(
            {
                "source_item_id": item.id,
                "platform": item.source_name,
                "author": item.author,
                "important": bool(item.is_important),
                "content": content[:DAILY_REPORT_SENTIMENT_CONTENT_CHARS],
                "content_truncated": len(content) > DAILY_REPORT_SENTIMENT_CONTENT_CHARS,
            }
        )
    return result


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
    title = _report_title(report_date)
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


def _report_title(report_date: date) -> str:
    return f"市场雷达日报｜{report_date.isoformat()}"


def _first_non_heading_line(markdown: str) -> str | None:
    for line in markdown.splitlines():
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        return value[:500]
    return None
