from datetime import date, datetime
from time import perf_counter

from sqlalchemy import select

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.ai_audit.service import create_ai_request_log
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.basic.system_config.service import get_runtime_state, set_runtime_state
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.service import get_active_prompt_by_key
from invest_assistant.modules.market_radar.backfill_requests import BACKFILL_JOB_NAME
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.daily_report import (
    DAILY_REPORT_JOB_NAME,
    DEFAULT_DAILY_REPORT_MODEL,
    generate_daily_report,
)
from invest_assistant.modules.market_radar.models import AiTagSuggestion, Hotword, SourceItem, Tag
from invest_assistant.modules.market_radar.schemas import SourceItemCreate
from invest_assistant.modules.stock_analysis.models import StockPoolItem
from invest_assistant.modules.track_discovery.models import Track
from invest_assistant.services.akshare.client import fetch_cls_news_rows, fetch_eastmoney_stock_news_rows, fetch_futu_news_rows
from invest_assistant.services.deepseek import client as deepseek_client
from invest_assistant.services.deepseek.client import DEFAULT_DEEPSEEK_MODEL
from invest_assistant.shared.time_utils import utc_now

DEEPSEEK_HOTWORD_JOB_NAME = "market_radar.extract_daily_hotwords_deepseek"

DAILY_HOTWORD_STATE_NAMESPACE = f"job.{DEEPSEEK_HOTWORD_JOB_NAME}"
HOTWORD_SOURCE_ITEM_CURSOR_KEY = "source_item_last_id"


def _runtime_state_int_value(value: str | None) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _hotword_source_item_cursor(db) -> int:
    state = get_runtime_state(db, DAILY_HOTWORD_STATE_NAMESPACE, HOTWORD_SOURCE_ITEM_CURSOR_KEY)
    state_value = state.state_value if state is not None else None
    return _runtime_state_int_value(state_value)


def _fetch_cls_rows(limit: int) -> list[dict]:
    return fetch_cls_news_rows(limit)


def _fetch_futu_rows(limit: int) -> list[dict]:
    return fetch_futu_news_rows(limit)


def _fetch_eastmoney_stock_news_rows(stock_code: str, limit: int) -> list[dict]:
    return fetch_eastmoney_stock_news_rows(stock_code, limit)


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


def _normalize_futu_row(row: dict) -> SourceItemCreate | None:
    title = str(row.get("标题") or "").strip()
    content = str(row.get("内容") or title or "").strip()
    source_url = str(row.get("链接") or "").strip() or None
    publish_time = str(row.get("发布时间") or "").strip() or None
    if not content:
        return None
    return SourceItemCreate(
        source_type="news",
        source_name="富途牛牛",
        title=(title or content)[:120],
        content=content,
        source_url=source_url,
        publish_time=publish_time,
    )


def _normalize_eastmoney_stock_news_row(row: dict, stock_id: int) -> SourceItemCreate | None:
    title = str(row.get("新闻标题") or "").strip()
    content = str(row.get("新闻内容") or title or "").strip()
    source_url = str(row.get("新闻链接") or "").strip() or None
    publish_time = str(row.get("发布时间") or "").strip() or None
    if not title and not content:
        return None
    return SourceItemCreate(
        source_type="news",
        source_name="东方财富",
        title=(title or content)[:120],
        content=content or title,
        source_url=source_url,
        publish_time=publish_time.replace(" ", "T") if publish_time else None,
        related_type="stock",
        related_id=stock_id,
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


def fetch_futu_news_job(limit: int = 50, **kwargs) -> JobResult:
    try:
        raw_rows = _fetch_futu_rows(max(int(limit), 1))
    except Exception as exc:
        return JobResult(success=False, message=str(exc))

    rows = []
    for row in raw_rows:
        payload = _normalize_futu_row(row)
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
        message=f"fetched {len(rows)} Futu news",
        fetched_count=len(rows),
        inserted_count=inserted,
        skipped_count=skipped,
    )


def extract_tags_job(batch_limit: int | None = None, **kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.extract_tags(db, batch_limit=batch_limit)
    finally:
        db.close()


def backfill_source_tags_job(
    tag_type: str | None = None,
    tag_id: int | None = None,
    tag_ids: list[int] | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    source_type: str | None = None,
    overwrite: bool = False,
    **kwargs,
) -> JobResult:
    db = SessionLocal()
    try:
        return service.backfill_source_tags(
            db,
            tag_type=tag_type,
            tag_id=tag_id,
            tag_ids=tag_ids,
            start_time=start_time,
            end_time=end_time,
            source_type=source_type,
            overwrite=overwrite,
        )
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


def generate_daily_report_job(
    report_date: str | None = None,
    model: str | None = None,
    **kwargs,
) -> JobResult:
    db = SessionLocal()
    try:
        parsed_report_date = date.fromisoformat(report_date) if report_date else None
        return generate_daily_report(
            db,
            report_date=parsed_report_date,
            model=model or DEFAULT_DAILY_REPORT_MODEL,
        )
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


def _today_news_items(db, target_date: date, max_items: int, cursor: int = 0) -> list[SourceItem]:
    rows = list(
        db.scalars(
            select(SourceItem)
            .where(SourceItem.source_type == "news")
            .where(SourceItem.id > cursor)
            .order_by(SourceItem.publish_time.desc(), SourceItem.id.desc())
        )
    )
    items = []
    for item in rows:
        if _source_item_date(item) != target_date:
            continue
        items.append(item)
        if len(items) >= max_items:
            break
    return items


def _news_payload(items: list[SourceItem]) -> list[dict]:
    return [
        {
            "title": item.title,
            "content": item.content,
            "publish_time": item.publish_time.isoformat() if item.publish_time is not None else None,
        }
        for item in items
    ]


def _normalized_existing_hotword_names(db) -> set[str]:
    tag_names = {
        str(name).strip().casefold()
        for name in db.scalars(select(Tag.name).where(Tag.type.in_(["hotword", "track"]), Tag.status != "disabled"))
        if str(name).strip()
    }
    track_names = {
        str(name).strip().casefold()
        for name in db.scalars(select(Track.name).where(Track.status != "disabled"))
        if str(name).strip()
    }
    stock_names = {
        str(name).strip().casefold()
        for name in db.scalars(select(Stock.stock_name).where(Stock.status != "disabled"))
        if str(name).strip()
    }
    hotword_names = {
        str(name).strip().casefold()
        for name in db.scalars(select(Hotword.name).where(Hotword.status != "disabled"))
        if str(name).strip()
    }
    suggestions = {
        str(name).strip().casefold()
        for name in db.scalars(select(AiTagSuggestion.suggested_text))
        if str(name).strip()
    }
    return tag_names | track_names | stock_names | hotword_names | suggestions


def _normalize_score(value) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        score = 0
    return max(0, min(score, 10))


def _candidate_payloads_from_hotwords(db, hotwords: list[dict]) -> list[dict]:
    existing = _normalized_existing_hotword_names(db)
    rejected_suggestions = {
        suggestion.suggested_text.strip().casefold(): suggestion
        for suggestion in db.scalars(select(AiTagSuggestion).where(AiTagSuggestion.status == "rejected"))
        if suggestion.suggested_text.strip()
    }
    bumped_rejected_count = 0
    payloads: list[dict] = []
    for item in hotwords:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        key = name.casefold()
        if key in existing:
            suggestion = rejected_suggestions.get(key)
            if suggestion is not None:
                suggestion.rejected_count = int(suggestion.rejected_count or 0) + 1
                bumped_rejected_count += 1
            continue
        score = _normalize_score(item.get("score"))
        reason = str(item.get("reason") or "").strip()
        payloads.append(
            {
                "name": name,
                "score": score,
                "reason": reason if reason else None,
            }
        )
        existing.add(key)
    if bumped_rejected_count:
        db.commit()
    return payloads


def _create_hotword_candidates(db, hotwords: list[dict]) -> list[tuple[str, int]]:
    payloads = _candidate_payloads_from_hotwords(db, hotwords)
    inserted: list[tuple[str, int]] = []
    for item in payloads:
        service.create_ai_tag_suggestion(
            db,
            service.ai_suggestion_from_hotword_payload(
                item["name"],
                item["score"],
                item["reason"],
            ),
        )
        inserted.append((item["name"], item["score"]))
    return inserted


def extract_daily_hotwords_deepseek_job(
    target_date: str | None = None,
    max_items: int = 200,
    model: str | None = None,
    ignore_watermark: bool = False,
    **kwargs,
) -> JobResult:
    db = SessionLocal()
    try:
        run_date = _parse_target_date(target_date)
        old_cursor = _hotword_source_item_cursor(db)
        effective_cursor = 0 if ignore_watermark else old_cursor
        source_items = _today_news_items(db, run_date, max(int(max_items), 1), effective_cursor)
        news = _news_payload(source_items)
        if not news:
            return JobResult(
                success=True,
                message="no news source items after watermark for target date",
                processed_count=0,
                skipped_count=1,
                extra={
                    "target_date": run_date.isoformat(),
                    "old_cursor": old_cursor,
                    "new_cursor": old_cursor,
                    "state_namespace": DAILY_HOTWORD_STATE_NAMESPACE,
                    "state_key": HOTWORD_SOURCE_ITEM_CURSOR_KEY,
                    "ignore_watermark": ignore_watermark,
                },
            )

        prompt = get_active_prompt_by_key(db, DEEPSEEK_HOTWORD_JOB_NAME)
        if prompt is None:
            message = f"active prompt not found: {DEEPSEEK_HOTWORD_JOB_NAME}"
            create_ai_request_log(
                db,
                provider="deepseek",
                model=model or DEFAULT_DEEPSEEK_MODEL,
                task_name=DEEPSEEK_HOTWORD_JOB_NAME,
                status="failed",
                duration_ms=0,
                error_message=message,
            )
            return JobResult(success=False, message=message, processed_count=len(news))

        active_model = model or prompt.model
        started = perf_counter()
        try:
            response = deepseek_client.extract_hotwords(news, prompt, active_model)
        except Exception as exc:
            create_ai_request_log(
                db,
                provider="deepseek",
                model=active_model,
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
            model=active_model,
            task_name=DEEPSEEK_HOTWORD_JOB_NAME,
            status="success",
            duration_ms=int((perf_counter() - started) * 1000),
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            total_tokens=int(usage.get("total_tokens") or 0),
        )
        inserted = _create_hotword_candidates(db, list(response.get("hotwords") or []))
        new_cursor = max(old_cursor, *(int(item.id) for item in source_items))
        set_runtime_state(
            db,
            DAILY_HOTWORD_STATE_NAMESPACE,
            HOTWORD_SOURCE_ITEM_CURSOR_KEY,
            str(new_cursor),
            value_type="int",
            ext={
                "job_name": DEEPSEEK_HOTWORD_JOB_NAME,
                "old_cursor": old_cursor,
                "processed_count": len(news),
                "inserted_count": len(inserted),
                "model": active_model,
                "target_date": run_date.isoformat(),
                "ignore_watermark": ignore_watermark,
            },
        )
        return JobResult(
            success=True,
            message=f"created {len(inserted)} hotword candidates",
            processed_count=len(news),
            inserted_count=len(inserted),
            skipped_count=max(len(response.get("hotwords") or []) - len(inserted), 0),
            extra={
                "target_date": run_date.isoformat(),
                "model": active_model,
                "old_cursor": old_cursor,
                "new_cursor": new_cursor,
                "state_namespace": DAILY_HOTWORD_STATE_NAMESPACE,
                "state_key": HOTWORD_SOURCE_ITEM_CURSOR_KEY,
                "ignore_watermark": ignore_watermark,
            },
        )
    finally:
        db.close()


def fetch_stock_news_job(stock_code: str | None = None, limit: int = 50, sleep_ms: int = 500, **kwargs) -> JobResult:
    import time

    db = SessionLocal()
    try:
        target_scope = "stock_pool"
        if stock_code and str(stock_code).strip():
            target_scope = "stock_code"
            target_code = str(stock_code).strip()
            stocks = list(db.scalars(select(Stock).where(Stock.stock_code == target_code)))
            if not stocks:
                return JobResult(
                    success=False,
                    message=f"Stock code {target_code} not found in database",
                    processed_count=0,
                    extra={"target_scope": target_scope, "per_stock": []},
                )
        else:
            stock_rows = db.scalars(
                select(Stock)
                .join(StockPoolItem, StockPoolItem.stock_id == Stock.id)
                .where(Stock.status == "active")
                .order_by(StockPoolItem.updated_at.desc(), StockPoolItem.id.desc())
            )
            stocks = []
            seen_stock_ids = set()
            for stock in stock_rows:
                if stock.id in seen_stock_ids:
                    continue
                seen_stock_ids.add(stock.id)
                stocks.append(stock)
            if not stocks:
                return JobResult(
                    success=True,
                    message="No stock pool items found to fetch",
                    processed_count=0,
                    extra={"target_scope": target_scope, "per_stock": []},
                )

        total_fetched = 0
        total_inserted = 0
        total_skipped = 0
        per_stock = []
        row_limit = max(int(limit), 1)
        delay_sec = max(int(sleep_ms), 0) / 1000.0

        for idx, stock in enumerate(stocks):
            if idx > 0 and delay_sec > 0:
                time.sleep(delay_sec)

            code = stock.stock_code
            stock_summary = {
                "stock_code": code,
                "stock_name": stock.stock_name,
                "fetched": 0,
                "inserted": 0,
                "skipped": 0,
                "error": None,
            }
            try:
                rows = _fetch_eastmoney_stock_news_rows(code, row_limit)
            except Exception as exc:
                stock_summary["error"] = str(exc)
                per_stock.append(stock_summary)
                continue

            stock_summary["fetched"] = len(rows)
            total_fetched += len(rows)
            for row in rows:
                payload = _normalize_eastmoney_stock_news_row(row, stock.id)
                if payload is None:
                    total_skipped += 1
                    stock_summary["skipped"] += 1
                    continue
                exists = service.find_duplicate_source_item(db, payload)
                if exists is not None:
                    total_skipped += 1
                    stock_summary["skipped"] += 1
                    continue
                service.create_source_item(db, payload)
                total_inserted += 1
                stock_summary["inserted"] += 1
            per_stock.append(stock_summary)

        return JobResult(
            success=True,
            message=f"Stock news fetching complete. Fetched: {total_fetched}, Inserted: {total_inserted}, Skipped: {total_skipped}",
            fetched_count=total_fetched,
            processed_count=len(stocks),
            inserted_count=total_inserted,
            skipped_count=total_skipped,
            extra={"target_scope": target_scope, "per_stock": per_stock},
        )
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name="market_radar.fetch_stock_news",
        module_name="market_radar",
        display_name="抓取个股新闻",
        description="批量抓取股票标的池中的东方财富个股新闻并写入 source_item",
        handler=fetch_stock_news_job,
        trigger_type="both",
        cron_expr="0 8 * * *",
        timeout_seconds=1200,
        max_retries=1,
        params_schema={
            "stock_code": {"type": "string", "label": "特定股票代码", "placeholder": "选填，输入6位数字代码以手动抓取特定标的"},
            "limit": {"type": "number", "label": "每只股票最多新闻条数", "default": 50, "min": 1},
            "sleep_ms": {"type": "number", "label": "请求间隔(毫秒)", "default": 500, "min": 0},
        },
        tags=["news", "stock_news", "market_radar"],
    ),
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
        job_name="market_radar.fetch_futu_news",
        module_name="market_radar",
        display_name="抓取富途快讯",
        description="抓取富途牛牛快讯并写入 source_item",
        handler=fetch_futu_news_job,
        trigger_type="both",
        cron_expr="*/30 * * * *",
        timeout_seconds=120,
        max_retries=1,
        params_schema={"limit": {"type": "number", "label": "最多快讯条数", "default": 50, "min": 1}},
        tags=["news", "futu", "market_radar"],
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
        params_schema={"batch_limit": {"type": "number", "label": "每批处理条数", "default": 500, "min": 1}},
        tags=["tag", "market_radar"],
    ),
    JobDefinition(
        job_name=BACKFILL_JOB_NAME,
        module_name="market_radar",
        display_name="信息流标签回溯打标",
        description="按标签类型、标签、时间范围和信息类型回溯补齐 source_tag",
        handler=backfill_source_tags_job,
        trigger_type="manual",
        timeout_seconds=300,
        max_retries=1,
        params_schema={
            "tag_type": {
                "type": "select",
                "label": "标签类型",
                "default": "all",
                "options": [
                    {"value": "all", "label": "全部"},
                    {"value": "stock", "label": "标的"},
                    {"value": "track", "label": "赛道"},
                    {"value": "hotword", "label": "热点词"},
                ],
            },
            "tag_id": {"type": "number", "label": "标签 ID", "min": 1},
            "start_time": {"type": "string", "label": "开始时间", "placeholder": "YYYY-MM-DD 或 ISO 时间"},
            "end_time": {"type": "string", "label": "结束时间", "placeholder": "YYYY-MM-DD 或 ISO 时间"},
            "source_type": {
                "type": "select",
                "label": "信息类型",
                "options": [
                    {"value": "", "label": "全部"},
                    {"value": "news", "label": "新闻"},
                    {"value": "announcement", "label": "公告"},
                    {"value": "policy", "label": "政策"},
                    {"value": "sentiment", "label": "舆情"},
                    {"value": "research", "label": "研报"},
                ],
            },
            "overwrite": {"type": "boolean", "label": "覆盖已有打标", "default": False},
        },
        tags=["tag", "backfill", "market_radar"],
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
            "ignore_watermark": {"type": "boolean", "label": "忽略水位重跑", "default": False},
        },
        tags=["tag", "ai", "market_radar"],
    ),
    JobDefinition(
        job_name="market_radar.aggregate_heat",
        module_name="market_radar",
        display_name="聚合标签热度",
        description="按 24h/7d/30d 统计标签热度快照",
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
    JobDefinition(
        job_name=DAILY_REPORT_JOB_NAME,
        module_name="market_radar",
        display_name="生成市场雷达日报",
        description="用 DeepSeek Pro 生成前一自然日市场雷达 Markdown 日报",
        handler=generate_daily_report_job,
        trigger_type="both",
        cron_expr="0 3 * * *",
        timeout_seconds=600,
        max_retries=1,
        params_schema={
            "report_date": {"type": "string", "label": "报告日期", "placeholder": "YYYY-MM-DD，留空为前一自然日"},
            "model": {"type": "string", "label": "DeepSeek 模型", "default": DEFAULT_DAILY_REPORT_MODEL},
        },
        tags=["ai", "report", "market_radar"],
    ),
]
