from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.schemas import SourceItemCreate
from invest_assistant.services.akshare.client import fetch_cls_news_rows


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
