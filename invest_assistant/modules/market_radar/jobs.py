from datetime import date, datetime
from time import perf_counter

from sqlalchemy import select

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.ai_audit.service import create_ai_request_log
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.models import HotwordAlias, SourceItem, Tag, TagCandidate
from invest_assistant.modules.market_radar.schemas import SourceItemCreate, TagCandidateCreate
from invest_assistant.services.akshare.client import fetch_cls_news_rows
from invest_assistant.services.deepseek import client as deepseek_client
from invest_assistant.services.deepseek.client import DEFAULT_DEEPSEEK_MODEL
from invest_assistant.shared.time_utils import utc_now

DEEPSEEK_HOTWORD_JOB_NAME = "market_radar.extract_daily_hotwords_deepseek"


def _fetch_cls_rows(limit: int) -> list[dict]:
    return fetch_cls_news_rows(limit)


def _normalize_cls_row(row: dict) -> SourceItemCreate | None:
    published_date = str(row.get("发布日期") or "").strip()
    published_time = str(row.get("发布时间") or "").strip()
    title = str(row.get("标题") or "").strip()
    content = str(row.get("内容") or title or "").strip()
    if not content:
        return None
    return SourceItemCreate(
        source_type="news",
        source_name="财联社",
        title=(title or content)[:120],
        content=content,
        source_url=None,
        publish_time=f"{published_date}T{published_time}" if published_date and published_time else None,
    )


def fetch_news_job(limit: int = 50, **kwargs) -> JobResult:
    try:
        raw_rows = _fetch_cls_rows(max(int(limit), 1))
    except Exception as exc:
        return JobResult(success=False, message=str(exc))

    rows = []
    for row in raw_rows:
        payload = _normalize_cls_row(row)
        if payload is not None:
            rows.append(payload)

    db = SessionLocal()
    try:
        inserted = 0
        skipped = 0
        for payload in rows:
            exists = service.find_duplicate_source_item(db, payload)
            if exists is not None:
                skipped += 1
                continue
            service.create_source_item(db, payload)
            inserted += 1
    finally:
        db.close()
    return JobResult(
        success=True,
        message=f"fetched {len(rows)} CLS news",
        fetched_count=len(rows),
        inserted_count=inserted,
        skipped_count=skipped,
    )


def extract_tags_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.extract_tags(db)
    finally:
        db.close()


def aggregate_heat_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.aggregate_heat(db)
    finally:
        db.close()


def aggregate_edges_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.aggregate_edges(db)
    finally:
        db.close()


def _parse_target_date(value: str | None) -> date:
    if not value:
        return utc_now().date()
    return date.fromisoformat(value)


def _source_item_date(item: SourceItem) -> date:
    value = item.publish_time or item.created_at
    if isinstance(value, datetime):
        return value.date()
    return utc_now().date()


def _today_news_payload(db, target_date: date, max_items: int) -> list[dict]:
    rows = list(
        db.scalars(
            select(SourceItem)
            .where(SourceItem.source_type == "news")
            .order_by(SourceItem.publish_time.desc(), SourceItem.id.desc())
        )
    )
    news = []
    for item in rows:
        if _source_item_date(item) != target_date:
            continue
        news.append(
            {
                "title": item.title,
                "content": item.content,
                "publish_time": item.publish_time.isoformat() if item.publish_time is not None else None,
            }
        )
        if len(news) >= max_items:
            break
    return news


def _normalized_existing_hotword_names(db) -> set[str]:
    names = {
        str(name).strip().casefold()
        for name in db.scalars(select(Tag.name).where(Tag.type == "hotword"))
        if str(name).strip()
    }
    aliases = {
        str(alias).strip().casefold()
        for alias in db.scalars(select(HotwordAlias.alias).where(HotwordAlias.status != "disabled"))
        if str(alias).strip()
    }
    candidates = {
        str(name).strip().casefold()
        for name in db.scalars(
            select(TagCandidate.name).where(
                TagCandidate.suggested_type == "hotword",
                TagCandidate.status.in_(("pending", "approved", "merged")),
            )
        )
        if str(name).strip()
    }
    return names | aliases | candidates


def _normalize_score(value) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        score = 0
    return max(0, min(score, 10))


def _create_hotword_candidates(db, hotwords: list[dict]) -> list[tuple[str, int]]:
    existing = _normalized_existing_hotword_names(db)
    inserted: list[tuple[str, int]] = []
    for item in hotwords:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        key = name.casefold()
        if key in existing:
            continue
        score = _normalize_score(item.get("score"))
        reason = str(item.get("reason") or "").strip()
        service.create_candidate(
            db,
            TagCandidateCreate(
                name=name,
                suggested_type="hotword",
                source_item_id=None,
                trigger_text=name,
                confidence=score / 10,
                reason=f"DeepSeek score={score}/10；{reason}" if reason else f"DeepSeek score={score}/10",
                status="pending",
            ),
        )
        existing.add(key)
        inserted.append((name, score))
    return inserted


def extract_daily_hotwords_deepseek_job(
    target_date: str | None = None,
    max_items: int = 200,
    model: str = DEFAULT_DEEPSEEK_MODEL,
    **kwargs,
) -> JobResult:
    db = SessionLocal()
    try:
        run_date = _parse_target_date(target_date)
        news = _today_news_payload(db, run_date, max(int(max_items), 1))
        if not news:
            return JobResult(success=True, message="no news source items for target date", processed_count=0, skipped_count=1)

        started = perf_counter()
        try:
            response = deepseek_client.extract_hotwords(news, model)
        except Exception as exc:
            create_ai_request_log(
                db,
                provider="deepseek",
                model=model,
                task_name=DEEPSEEK_HOTWORD_JOB_NAME,
                status="failed",
                duration_ms=int((perf_counter() - started) * 1000),
                error_message=str(exc),
            )
            return JobResult(success=False, message=str(exc), processed_count=len(news))

        usage = response.get("usage") or {}
        create_ai_request_log(
            db,
            provider="deepseek",
            model=model,
            task_name=DEEPSEEK_HOTWORD_JOB_NAME,
            status="success",
            duration_ms=int((perf_counter() - started) * 1000),
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            total_tokens=int(usage.get("total_tokens") or 0),
        )
        inserted = _create_hotword_candidates(db, list(response.get("hotwords") or []))
        if inserted:
            db.add(
                AlertEvent(
                    rule_id=None,
                    event_level="info",
                    title=f"今日新增 {len(inserted)} 个新闻热词候选",
                    message="；".join(f"{name} {score}/10" for name, score in inserted),
                    status="unread",
                )
            )
            db.commit()
        return JobResult(
            success=True,
            message=f"created {len(inserted)} hotword candidates",
            processed_count=len(news),
            inserted_count=len(inserted),
            skipped_count=max(len(response.get("hotwords") or []) - len(inserted), 0),
            extra={"target_date": run_date.isoformat(), "model": model},
        )
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name="market_radar.fetch_news",
        module_name="market_radar",
        display_name="抓取市场新闻",
        description="抓取财联社等市场新闻并写入 source_item",
        handler=fetch_news_job,
        trigger_type="both",
        cron_expr="*/30 * * * *",
        timeout_seconds=120,
        max_retries=1,
        tags=["news", "market_radar"],
    ),
    JobDefinition(
        job_name="market_radar.extract_tags",
        module_name="market_radar",
        display_name="抽取新闻标签",
        description="对未打标新闻抽取 stock / track / hotword 标签",
        handler=extract_tags_job,
        trigger_type="both",
        cron_expr="*/5 * * * *",
        timeout_seconds=180,
        max_retries=1,
        tags=["tag", "market_radar"],
    ),
    JobDefinition(
        job_name=DEEPSEEK_HOTWORD_JOB_NAME,
        module_name="market_radar",
        display_name="DeepSeek 新闻热词候选",
        description="用 DeepSeek 分析今日 news 信息流并生成热点词候选",
        handler=extract_daily_hotwords_deepseek_job,
        trigger_type="both",
        cron_expr="30 16 * * *",
        timeout_seconds=180,
        max_retries=1,
        params_schema={
            "target_date": {"type": "string", "label": "分析日期", "placeholder": "YYYY-MM-DD，留空为今天"},
            "max_items": {"type": "number", "label": "最多新闻条数", "default": 200, "min": 1},
        },
        tags=["tag", "ai", "market_radar"],
    ),
    JobDefinition(
        job_name="market_radar.aggregate_heat",
        module_name="market_radar",
        display_name="聚合标签热度",
        description="按 1h/24h/7d/30d 统计标签热度快照",
        handler=aggregate_heat_job,
        trigger_type="both",
        cron_expr="*/10 * * * *",
        timeout_seconds=180,
        max_retries=1,
        tags=["heat", "market_radar"],
    ),
    JobDefinition(
        job_name="market_radar.aggregate_edges",
        module_name="market_radar",
        display_name="聚合标签关系",
        description="聚合 stock-track 与 stock-hotword 关系快照",
        handler=aggregate_edges_job,
        trigger_type="both",
        cron_expr="*/10 * * * *",
        timeout_seconds=180,
        max_retries=1,
        tags=["edge", "market_radar"],
    ),
]
