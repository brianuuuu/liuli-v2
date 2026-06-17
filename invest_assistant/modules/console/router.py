from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.ai_audit.service import count_ai_request_logs, list_ai_request_logs_page
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunRequest
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY
from invest_assistant.modules.market_radar import service as market_service
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.stock_analysis.models import StockDailyBar, StockMaterial, StockPoolItem
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial

router = APIRouter(prefix="/api/console", tags=["console"], dependencies=[Depends(get_current_user)])

WORKBENCH_OPERATION_JOBS = (
    "track_discovery.review_track_events_deepseek",
    "stock_analysis.review_stock_events_deepseek",
    "market_radar.extract_daily_hotwords_deepseek",
    "market_radar.suggest_hotword_merges_deepseek",
)


def _format_time(value) -> str | None:
    return value.isoformat() if value is not None else None


def _run_request_summary(item: JobRunRequest) -> dict:
    return {
        "id": item.id,
        "job_name": item.job_name,
        "status": item.status,
        "requested_at": _format_time(item.requested_at),
        "started_at": _format_time(item.started_at),
        "finished_at": _format_time(item.finished_at),
    }


def _operation_job_summary(configs: dict[str, JobConfig]) -> list[dict]:
    return [
        {
            "job_name": job_name,
            "exists": job_name in JOB_REGISTRY,
            "last_run_at": _format_time(configs[job_name].last_run_at) if job_name in configs else None,
            "last_status": configs[job_name].last_status if job_name in configs else None,
        }
        for job_name in WORKBENCH_OPERATION_JOBS
    ]


def _active_status_filter(column):
    return ~func.lower(column).in_(("disabled", "archived", "ignored", "rejected", "inactive"))


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict:
    todo_events = (
        db.query(AlertEvent)
        .filter(AlertEvent.status != "handled")
        .order_by(AlertEvent.event_time.desc(), AlertEvent.id.desc())
        .limit(6)
        .all()
    )
    return {
        "status": "ok",
        "todo_events": [
            {
                "id": event.id,
                "event_level": event.event_level,
                "title": event.title,
                "message": event.message,
                "status": event.status,
                "event_time": _format_time(event.event_time),
            }
            for event in todo_events
        ],
    }


@router.get("/workbench-today")
def workbench_today(db: Session = Depends(get_db)) -> dict:
    source_stats = market_service.count_source_items_by_day(db)
    hotword_stats = market_service.hotword_stats(db)
    ai_log_stats = count_ai_request_logs(db)
    pending_suggestions = market_service.count_ai_tag_suggestions(db, "pending")
    pending_track_materials = int(db.scalar(select(func.count(TrackMaterial.id)).where(TrackMaterial.status == "pending")) or 0)
    pending_stock_materials = int(db.scalar(select(func.count(StockMaterial.id)).where(StockMaterial.status == "pending")) or 0)
    unread_alerts = int(db.scalar(select(func.count(AlertEvent.id)).where(AlertEvent.status == "unread")) or 0)
    failed_jobs = int(
        db.scalar(
            select(func.count(JobConfig.id)).where(func.lower(JobConfig.last_status).in_(("failed", "error")))
        )
        or 0
    )
    recent_requests = list(
        db.scalars(
            select(JobRunRequest)
            .order_by(JobRunRequest.requested_at.desc(), JobRunRequest.id.desc())
            .limit(8)
        )
    )
    operation_configs = {
        item.job_name: item
        for item in db.scalars(select(JobConfig).where(JobConfig.job_name.in_(WORKBENCH_OPERATION_JOBS)))
    }
    return {
        "source_stats": source_stats,
        "active": {
            "tags": market_service.count_tags(db, status="active"),
            "hotwords": hotword_stats["active"],
            "stocks": int(db.scalar(select(func.count(StockPoolItem.id)).where(_active_status_filter(StockPoolItem.status))) or 0),
            "tracks": int(db.scalar(select(func.count(Track.id)).where(_active_status_filter(Track.status))) or 0),
        },
        "new": {
            "hotwords": hotword_stats["today"],
        },
        "ai": {
            "today": ai_log_stats["today"],
            "today_tokens": ai_log_stats["today_tokens"],
        },
        "todo": {
            "pending_suggestions": pending_suggestions,
            "pending_track_materials": pending_track_materials,
            "pending_stock_materials": pending_stock_materials,
            "unread_alerts": unread_alerts,
            "failed_jobs": failed_jobs,
            "total": pending_suggestions + pending_track_materials + pending_stock_materials + unread_alerts + failed_jobs,
        },
        "operation_jobs": _operation_job_summary(operation_configs),
        "recent_run_requests": [_run_request_summary(item) for item in recent_requests],
    }


@router.get("/system-status")
def system_status(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"api": "ok", "database": "ok"}


@router.get("/data-sources")
def data_sources(db: Session = Depends(get_db)) -> list[dict[str, str | int | None]]:
    stock_count = db.scalar(text("SELECT COUNT(*) FROM stock")) or 0
    cls_count = db.scalar(
        text("SELECT COUNT(*) FROM source_item WHERE source_type = 'news' AND source_name = '财联社'")
    ) or 0
    futu_count = db.scalar(
        text("SELECT COUNT(*) FROM source_item WHERE source_type = 'news' AND source_name = '富途牛牛'")
    ) or 0
    eastmoney_count = db.scalar(
        text("SELECT COUNT(*) FROM source_item WHERE source_type = 'news' AND source_name = '东方财富'")
    ) or 0
    cninfo_disclosure_count = db.scalar(
        db.query(func.count(CompanyDisclosure.id)).filter(CompanyDisclosure.source == "cninfo").statement
    ) or 0
    stock_daily_bar_count = db.scalar(
        db.query(func.count(StockDailyBar.id)).filter(StockDailyBar.source == "tushare").statement
    ) or 0

    stock_job = db.query(JobConfig).filter(JobConfig.job_name == "stock_master.sync_stock_basic").one_or_none()
    news_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_news").one_or_none()
    futu_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_futu_news").one_or_none()
    eastmoney_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_stock_news").one_or_none()
    stock_daily_bar_job = db.query(JobConfig).filter(JobConfig.job_name == "stock_analysis.sync_daily_bars").one_or_none()
    cninfo_disclosure_job = (
        db.query(JobConfig).filter(JobConfig.job_name == "disclosure_library.fetch_stock_announcements").one_or_none()
    )

    latest_cls_time = db.scalar(
        db.query(func.max(SourceItem.publish_time))
        .filter(SourceItem.source_type == "news", SourceItem.source_name == "财联社")
        .statement
    )
    latest_futu_time = db.scalar(
        db.query(func.max(SourceItem.publish_time))
        .filter(SourceItem.source_type == "news", SourceItem.source_name == "富途牛牛")
        .statement
    )
    latest_eastmoney_time = db.scalar(
        db.query(func.max(SourceItem.publish_time))
        .filter(SourceItem.source_type == "news", SourceItem.source_name == "东方财富")
        .statement
    )
    latest_cninfo_disclosure_time = db.scalar(
        db.query(func.max(CompanyDisclosure.publish_time)).filter(CompanyDisclosure.source == "cninfo").statement
    )
    latest_stock_daily_bar_time = db.scalar(
        db.query(func.max(StockDailyBar.updated_at)).filter(StockDailyBar.source == "tushare").statement
    )

    return [
        {
            "key": "stock-master",
            "name": "股票基础库",
            "module": "basic/stock_master",
            "provider": "Tushare / AkShare",
            "record_count": int(stock_count),
            "status": stock_job.last_status if stock_job is not None else "unknown",
            "last_sync_at": _format_time(stock_job.last_run_at if stock_job is not None else None),
        },
        {
            "key": "stock-daily-bars",
            "name": "日线行情（Tushare）",
            "module": "stock_analysis",
            "provider": "Tushare",
            "record_count": int(stock_daily_bar_count),
            "status": stock_daily_bar_job.last_status if stock_daily_bar_job is not None else "unknown",
            "last_sync_at": _format_time(
                stock_daily_bar_job.last_run_at if stock_daily_bar_job is not None else latest_stock_daily_bar_time
            ),
        },
        {
            "key": "cninfo-disclosures",
            "name": "公告库（巨潮）",
            "module": "basic/disclosure_library",
            "provider": "巨潮资讯",
            "record_count": int(cninfo_disclosure_count),
            "status": cninfo_disclosure_job.last_status if cninfo_disclosure_job is not None else "unknown",
            "last_sync_at": _format_time(
                cninfo_disclosure_job.last_run_at
                if cninfo_disclosure_job is not None
                else latest_cninfo_disclosure_time
            ),
        },
        {
            "key": "cls-news",
            "name": "信息流（财联社）",
            "module": "market_radar",
            "provider": "AkShare",
            "record_count": int(cls_count),
            "status": news_job.last_status if news_job is not None else "unknown",
            "last_sync_at": _format_time(news_job.last_run_at if news_job is not None else latest_cls_time),
        },
        {
            "key": "futu-news",
            "name": "信息流（富途牛牛）",
            "module": "market_radar",
            "provider": "AkShare",
            "record_count": int(futu_count),
            "status": futu_job.last_status if futu_job is not None else "unknown",
            "last_sync_at": _format_time(futu_job.last_run_at if futu_job is not None else latest_futu_time),
        },
        {
            "key": "eastmoney-news",
            "name": "信息流（东方财富）",
            "module": "market_radar",
            "provider": "AkShare",
            "record_count": int(eastmoney_count),
            "status": eastmoney_job.last_status if eastmoney_job is not None else "unknown",
            "last_sync_at": _format_time(eastmoney_job.last_run_at if eastmoney_job is not None else latest_eastmoney_time),
        },
    ]


@router.get("/ai-logs/stats")
def ai_log_stats(db: Session = Depends(get_db)) -> dict[str, int]:
    return count_ai_request_logs(db)


def _ai_log_dict(item) -> dict:
    return {
        "id": item.id,
        "request_id": item.request_id,
        "provider": item.provider,
        "model": item.model,
        "task_name": item.task_name,
        "status": item.status,
        "prompt_tokens": item.prompt_tokens,
        "completion_tokens": item.completion_tokens,
        "total_tokens": item.total_tokens,
        "duration_ms": item.duration_ms,
        "error_message": item.error_message,
        "created_at": _format_time(item.created_at),
    }


@router.get("/ai-logs")
def ai_logs(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    page = list_ai_request_logs_page(db, limit=limit, offset=offset)
    return {
        "items": [_ai_log_dict(item) for item in page.items],
        "total": page.total,
        "limit": page.limit,
        "offset": page.offset,
        "has_more": page.has_more,
    }
