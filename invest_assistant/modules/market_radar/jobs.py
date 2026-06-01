from datetime import date, datetime
from time import perf_counter

from sqlalchemy import select

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.ai_audit.service import create_ai_request_log
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.service import get_active_prompt_by_key
from invest_assistant.modules.market_radar.backfill_requests import BACKFILL_JOB_NAME
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.models import AiTagSuggestion, Hotword, SourceItem, Tag
from invest_assistant.modules.market_radar.schemas import SourceItemCreate
from invest_assistant.modules.track_discovery.models import Track
from invest_assistant.services.akshare.client import fetch_cls_news_rows, fetch_futu_news_rows
from invest_assistant.services.deepseek import client as deepseek_client
from invest_assistant.services.deepseek.client import DEFAULT_DEEPSEEK_MODEL
from invest_assistant.shared.time_utils import utc_now

DEEPSEEK_HOTWORD_JOB_NAME = "market_radar.extract_daily_hotwords_deepseek"
DEEPSEEK_HOTWORD_MERGE_JOB_NAME = "market_radar.suggest_hotword_merges_deepseek"
MERGE_SIMILARITY_THRESHOLD = 0.82


def _fetch_cls_rows(limit: int) -> list[dict]:
    return fetch_cls_news_rows(limit)


def _fetch_futu_rows(limit: int) -> list[dict]:
    return fetch_futu_news_rows(limit)


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


def extract_tags_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.extract_tags(db)
    finally:
        db.close()


def backfill_source_tags_job(
    tag_type: str | None = None,
    tag_id: int | None = None,
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


def _existing_hotword_merge_options(db) -> list[dict]:
    hotwords = list(db.scalars(select(Hotword).where(Hotword.status != "disabled").order_by(Hotword.name.asc())))
    return [{"hotword_id": item.id, "name": item.name, "tags": []} for item in hotwords]


def _normalize_score(value) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        score = 0
    return max(0, min(score, 10))


def _normalize_similarity(value) -> float:
    try:
        similarity = float(value)
    except (TypeError, ValueError):
        similarity = 0
    return max(0, min(similarity, 1))


def _suggest_hotword_merges(db, candidates: list[dict], model: str) -> dict[str, dict]:
    if not candidates:
        return {}
    existing_hotwords = _existing_hotword_merge_options(db)
    if not existing_hotwords:
        return {}
    prompt = get_active_prompt_by_key(db, DEEPSEEK_HOTWORD_MERGE_JOB_NAME)
    if prompt is None:
        return {}
    active_model = model or prompt.model
    started = perf_counter()
    try:
        response = deepseek_client.suggest_hotword_merges(
            [{"name": item["name"]} for item in candidates],
            existing_hotwords,
            prompt,
            active_model,
        )
    except Exception as exc:
        create_ai_request_log(
            db,
            provider="deepseek",
            model=active_model,
            task_name=DEEPSEEK_HOTWORD_MERGE_JOB_NAME,
            status="failed",
            duration_ms=int((perf_counter() - started) * 1000),
            error_message=str(exc),
        )
        return {}

    usage = response.get("usage") or {}
    create_ai_request_log(
        db,
        provider="deepseek",
        model=active_model,
        task_name=DEEPSEEK_HOTWORD_MERGE_JOB_NAME,
        status="success",
        duration_ms=int((perf_counter() - started) * 1000),
        prompt_tokens=int(usage.get("prompt_tokens") or 0),
        completion_tokens=int(usage.get("completion_tokens") or 0),
        total_tokens=int(usage.get("total_tokens") or 0),
    )
    valid_target_ids = {item["hotword_id"] for item in existing_hotwords}
    suggestions: dict[str, dict] = {}
    for item in response.get("suggestions") or []:
        candidate_name = str(item.get("candidate_name") or "").strip()
        target_tag_id = item.get("target_tag_id")
        similarity = _normalize_similarity(item.get("similarity"))
        if not candidate_name or target_tag_id not in valid_target_ids or similarity < MERGE_SIMILARITY_THRESHOLD:
            continue
        suggestions[candidate_name.casefold()] = {
            "suggested_target_tag_id": target_tag_id,
            "merge_similarity": similarity,
            "merge_reason": str(item.get("reason") or "").strip() or None,
        }
    return suggestions


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
                "reason": f"DeepSeek score={score}/10；{reason}" if reason else f"DeepSeek score={score}/10",
            }
        )
        existing.add(key)
    if bumped_rejected_count:
        db.commit()
    return payloads


def _create_hotword_candidates(db, hotwords: list[dict], model: str | None = None) -> list[tuple[str, int]]:
    payloads = _candidate_payloads_from_hotwords(db, hotwords)
    merge_suggestions = _suggest_hotword_merges(db, payloads, model)
    inserted: list[tuple[str, int]] = []
    for item in payloads:
        merge_suggestion = merge_suggestions.get(item["name"].casefold(), {})
        service.create_ai_tag_suggestion(
            db,
            service.ai_suggestion_from_hotword_payload(
                item["name"],
                item["score"],
                item["reason"],
                ext={"merge_suggestion": merge_suggestion} if merge_suggestion else {},
            ),
        )
        inserted.append((item["name"], item["score"]))
    return inserted


def extract_daily_hotwords_deepseek_job(
    target_date: str | None = None,
    max_items: int = 200,
    model: str | None = None,
    **kwargs,
) -> JobResult:
    db = SessionLocal()
    try:
        run_date = _parse_target_date(target_date)
        news = _today_news_payload(db, run_date, max(int(max_items), 1))
        if not news:
            return JobResult(success=True, message="no news source items for target date", processed_count=0, skipped_count=1)

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
        inserted = _create_hotword_candidates(db, list(response.get("hotwords") or []), model)
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
            extra={"target_date": run_date.isoformat(), "model": active_model},
        )
    finally:
        db.close()


def fetch_stock_news_job(stock_code: str | None = None, limit: int = 20, sleep_ms: int = 500, **kwargs) -> JobResult:
    import time
    import akshare as ak
    import requests
    from invest_assistant.bootstrap.database import SessionLocal
    from invest_assistant.modules.basic.stock_master.models import Stock
    from invest_assistant.modules.market_radar.schemas import SourceItemCreate
    from invest_assistant.modules.market_radar import service as market_radar_service

    # Force requests inside ak.stock_news_em's global namespace to decode EastMoney JSONP using UTF-8
    try:
        import requests
        if not hasattr(requests, "_original_get"):
            requests._original_get = requests.get
            def utf8_global_get(url, *args, **kwargs):
                res = requests._original_get(url, *args, **kwargs)
                if isinstance(url, str) and ("eastmoney.com" in url or "search-api-web" in url):
                    res.encoding = "utf-8"
                return res
            requests.get = utf8_global_get
    except Exception:
        pass

    try:
        fn = ak.stock_news_em
        target_requests = fn.__globals__.get("requests")
        if target_requests is not None:
            if not hasattr(target_requests, "_original_get"):
                target_requests._original_get = target_requests.get
                def utf8_requests_get(url, *args, **kwargs):
                    res = target_requests._original_get(url, *args, **kwargs)
                    if isinstance(url, str) and ("eastmoney.com" in url or "search-api-web" in url):
                        res.encoding = "utf-8"
                    return res
                target_requests.get = utf8_requests_get
    except Exception:
        pass

    db = SessionLocal()
    try:
        # Determine the target stocks to fetch
        if stock_code and str(stock_code).strip():
            target_code = str(stock_code).strip()
            stocks = list(db.scalars(select(Stock).where(Stock.stock_code == target_code)))
            if not stocks:
                return JobResult(success=False, message=f"Stock code {target_code} not found in database", processed_count=0)
        else:
            stocks = list(db.scalars(select(Stock).where(Stock.status == "active")))
            if not stocks:
                return JobResult(success=True, message="No active stocks found to fetch", processed_count=0)

        total_fetched = 0
        total_inserted = 0
        total_skipped = 0
        delay_sec = max(int(sleep_ms), 0) / 1000.0

        for idx, stock in enumerate(stocks):
            if idx > 0 and delay_sec > 0:
                time.sleep(delay_sec)

            code = stock.stock_code
            try:
                # Some akshare versions use symbol, some use stock
                df = ak.stock_news_em(symbol=code)
            except TypeError:
                try:
                    df = ak.stock_news_em(stock=code)
                except Exception:
                    continue
            except Exception:
                continue

            if df is not None and not df.empty:
                for _, row in df.head(int(limit)).iterrows():
                    total_fetched += 1
                    
                    title = str(row.get("新闻标题") or "").strip()
                    content = str(row.get("新闻内容") or "").strip()
                    # Always force source_name to '东方财富' as all stock news is fetched from the EastMoney API
                    source_name = "东方财富"
                    source_url = str(row.get("新闻链接") or "").strip() or None
                    
                    pub_time_str = str(row.get("发布时间") or "").strip()
                    publish_time = pub_time_str.replace(" ", "T") if pub_time_str else None

                    if not title and not content:
                        continue

                    payload = SourceItemCreate(
                        source_type="news",
                        source_name=source_name,
                        title=title[:120],
                        content=content or title,
                        source_url=source_url,
                        publish_time=publish_time,
                        related_type="stock",
                        related_id=stock.id,
                    )

                    exists = market_radar_service.find_duplicate_source_item(db, payload)
                    if exists is not None:
                        total_skipped += 1
                        continue
                    
                    market_radar_service.create_source_item(db, payload)
                    total_inserted += 1

        return JobResult(
            success=True,
            message=f"Stock news fetching complete. Fetched: {total_fetched}, Inserted: {total_inserted}, Skipped: {total_skipped}",
            fetched_count=total_fetched,
            processed_count=len(stocks),
            inserted_count=total_inserted,
            skipped_count=total_skipped,
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
            "limit": {"type": "number", "label": "最多新闻条数", "default": 20, "min": 1},
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
