from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.ai_audit.service import (
    ai_request_log_daily_usage,
    count_ai_request_logs,
    list_ai_request_logs_page,
)
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunLog, JobRunRequest
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY
from invest_assistant.modules.basic.job_center import service as job_service
from invest_assistant.modules.basic.report_library import service as report_service
from invest_assistant.modules.basic.mcp.auth import load_mcp_clients
from invest_assistant.modules.basic.mcp.debug_logger import is_mcp_debug_log_enabled
from invest_assistant.modules.basic.mcp.registry import registered_tool_names
from invest_assistant.modules.knowledge_base import service as knowledge_service
from invest_assistant.modules.market_radar import service as market_service
from invest_assistant.modules.market_radar.models import AiTagSuggestion, SourceItem
from invest_assistant.modules.portfolio import service as portfolio_service
from invest_assistant.modules.portfolio.models import PortfolioPosition
from invest_assistant.modules.stock_analysis import service as stock_service
from invest_assistant.modules.stock_analysis.models import StockDailyBar, StockMaterial, StockPoolItem
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial
from invest_assistant.shared.time_utils import utc_now

router = APIRouter(prefix="/api/console", tags=["console"], dependencies=[Depends(get_current_user)])

WORKBENCH_OPERATION_JOBS = (
    "track_discovery.review_track_events_deepseek",
    "stock_analysis.review_stock_events_deepseek",
    "market_radar.extract_daily_hotwords_deepseek",
)
MARKET_REFRESH_JOBS = (
    "stock_analysis.refresh_major_indices_realtime",
    "portfolio.refresh_all_realtime_quotes",
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


def _active_status_filter(column):
    return ~func.lower(column).in_(("disabled", "archived", "ignored", "rejected", "inactive"))


def _portfolio_today_summary(db: Session) -> dict:
    overview = portfolio_service.get_overview(db)
    summary = overview["summary"]
    latest_quote_time = db.scalar(select(func.max(PortfolioPosition.quote_time)))
    return {
        "portfolio_count": summary["portfolio_count"],
        "position_count": summary["position_count"],
        "total_value": summary["total_value"],
        "position_market_value": summary["position_market_value"],
        "cash_amount": summary["cash_amount"],
        "day_pnl": summary["day_pnl"],
        "day_pct": summary["day_pct"],
        "latest_quote_time": _format_time(latest_quote_time),
    }


def _market_refresh_summary(db: Session) -> dict:
    latest_requests = list(
        db.scalars(
            select(JobRunRequest)
            .where(JobRunRequest.job_name.in_(MARKET_REFRESH_JOBS))
            .order_by(JobRunRequest.requested_at.desc(), JobRunRequest.id.desc())
            .limit(6)
        )
    )
    latest_by_job: dict[str, JobRunRequest] = {}
    for item in latest_requests:
        latest_by_job.setdefault(item.job_name, item)
    statuses = [str(item.status or "").lower() for item in latest_by_job.values()]
    if not latest_by_job:
        status = "idle"
    elif any(item in {"pending", "running", "queued"} for item in statuses):
        status = "running"
    elif any(item in {"failed", "error"} for item in statuses):
        status = "failed"
    elif all(item in {"success", "completed"} for item in statuses):
        status = "success"
    else:
        status = statuses[0] if statuses else "unknown"
    latest_time = max((item.requested_at for item in latest_by_job.values() if item.requested_at is not None), default=None)
    return {
        "status": status,
        "last_requested_at": _format_time(latest_time),
        "jobs": [_run_request_summary(latest_by_job[job_name]) for job_name in MARKET_REFRESH_JOBS if job_name in latest_by_job],
    }


def mcp_status(db: Session) -> dict:
    clients = load_mcp_clients(db)
    enabled_clients = [client for client in clients if client.enabled]
    if not clients:
        status = "not_configured"
    elif not enabled_clients:
        status = "disabled"
    else:
        status = "ok"
    return {
        "status": status,
        "clients": len(clients),
        "enabled_clients": len(enabled_clients),
        "tools": len(registered_tool_names()),
        "debug_log": "enabled" if is_mcp_debug_log_enabled(db) else "disabled",
    }


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
    todo = _todo_summary(db)
    return {
        "market_indices": {
            "items": stock_service.list_major_index_quotes(db),
        },
        "portfolio_today": _portfolio_today_summary(db),
        # 今日那一屏三张卡走同一个接口：日界这种最容易写错的东西集中在后端算一次。
        "today_reports": report_service.list_today_reports(db),
        "market_refresh": _market_refresh_summary(db),
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
            "pending_suggestions": todo["suggestions"]["count"],
            "pending_reports": todo["reports"]["count"],
            "inbox_notes": todo["notes"]["count"],
            "unread_alerts": todo["alerts"]["count"],
            "total": todo["total"],
        },
    }


def _count_with_oldest(db: Session, id_column, time_column, *conditions) -> dict:
    count, oldest_at = db.execute(select(func.count(id_column), func.min(time_column)).where(*conditions)).one()
    return {"count": int(count or 0), "oldest_at": _format_time(oldest_at)}


def _summary_dict(summary: dict) -> dict:
    return {"count": summary["count"], "oldest_at": _format_time(summary["oldest_at"])}


def _todo_summary(db: Session) -> dict:
    """四类待办（与安卓待办同口径）：推荐词 / 报告 / 笔记 / 预警，各带最早积压时间。"""
    todo = {
        "suggestions": _count_with_oldest(db, AiTagSuggestion.id, AiTagSuggestion.created_at, AiTagSuggestion.status == "pending"),
        "reports": _summary_dict(knowledge_service.pending_import_feedback_summary(db)),
        "notes": _summary_dict(knowledge_service.inbox_notes_summary(db)),
        "alerts": _count_with_oldest(db, AlertEvent.id, AlertEvent.event_time, AlertEvent.status == "unread"),
    }
    todo["total"] = sum(item["count"] for item in todo.values())
    return todo


def _run_log_summary(log: JobRunLog | None) -> dict | None:
    if log is None:
        return None
    return {
        "id": log.id,
        "status": log.status,
        "trigger_type": log.trigger_type,
        "finished_at": _format_time(log.finished_at),
        "duration_ms": log.duration_ms,
        "processed_count": log.processed_count,
        "inserted_count": log.inserted_count,
        "updated_count": log.updated_count,
        "error_message": log.error_message,
    }


def _latest_run_log(db: Session, job_name: str) -> JobRunLog | None:
    return db.scalar(select(JobRunLog).where(JobRunLog.job_name == job_name).order_by(JobRunLog.id.desc()).limit(1))


@router.get("/workbench-operations")
def workbench_operations(db: Session = Depends(get_db)) -> dict:
    """工作台待办页：四类待办（与安卓待办同口径）+ AI 任务、异常任务、最近执行。只查这一页要用的数据，供轮询。"""
    todo = _todo_summary(db)

    configs = {item.job_name: item for item in db.scalars(select(JobConfig))}
    active_requests: dict[str, JobRunRequest] = {}
    for item in db.scalars(
        select(JobRunRequest).where(JobRunRequest.status.in_(("pending", "running"))).order_by(JobRunRequest.id.asc())
    ):
        active_requests.setdefault(item.job_name, item)
    pending_by_job = {
        "track_discovery.review_track_events_deepseek": int(
            db.scalar(select(func.count(TrackMaterial.id)).where(TrackMaterial.status == "pending")) or 0
        ),
        "stock_analysis.review_stock_events_deepseek": int(
            db.scalar(select(func.count(StockMaterial.id)).where(StockMaterial.status == "pending")) or 0
        ),
        "market_radar.extract_daily_hotwords_deepseek": todo["suggestions"]["count"],
    }
    ai_jobs = []
    for job_name in WORKBENCH_OPERATION_JOBS:
        config = configs.get(job_name)
        active = active_requests.get(job_name)
        ai_jobs.append(
            {
                "job_name": job_name,
                "display_name": config.display_name if config else job_name,
                "exists": job_name in JOB_REGISTRY,
                "pending": pending_by_job.get(job_name, 0),
                "next_run_at": _format_time(config.next_run_at) if config else None,
                "last_run": _run_log_summary(_latest_run_log(db, job_name)),
                "active_request": _run_request_summary(active) if active else None,
            }
        )

    failed_jobs = []
    for config in configs.values():
        if (config.last_status or "").lower() not in ("failed", "error"):
            continue
        last_run = _latest_run_log(db, config.job_name)
        failed_jobs.append(
            {
                "job_name": config.job_name,
                "display_name": config.display_name,
                "exists": config.job_name in JOB_REGISTRY,
                "last_run_at": _format_time(config.last_run_at),
                "error_message": last_run.error_message if last_run else None,
                "active_request": _run_request_summary(active_requests[config.job_name]) if config.job_name in active_requests else None,
            }
        )
    failed_jobs.sort(key=lambda item: item["last_run_at"] or "", reverse=True)

    recent_runs = [
        dict(_run_log_summary(log), job_name=log.job_name, display_name=configs[log.job_name].display_name if log.job_name in configs else log.job_name)
        for log in db.scalars(select(JobRunLog).order_by(JobRunLog.id.desc()).limit(8))
    ]
    ai_log_stats = count_ai_request_logs(db)
    return {
        "todo": todo,
        "ai_jobs": ai_jobs,
        "failed_jobs": failed_jobs,
        "recent_runs": recent_runs,
        "health": {
            "total_jobs": len(configs),
            "failed_jobs": len(failed_jobs),
            "running_jobs": len(active_requests),
            "latest_source_at": _format_time(
                db.scalar(select(func.max(SourceItem.publish_time)).where(SourceItem.publish_time <= utc_now()))
            ),
            "ai_today": ai_log_stats["today"],
            "ai_today_tokens": ai_log_stats["today_tokens"],
        },
    }


@router.post("/workbench-today/refresh-market")
def refresh_market_today(
    db: Session = Depends(get_db),
    user: UserAccount = Depends(get_current_user),
) -> dict:
    requests = [
        job_service.create_run_request(db, job_name, {}, getattr(user, "id", None))
        for job_name in MARKET_REFRESH_JOBS
    ]
    return {
        "status": "submitted",
        "request_ids": [item.id for item in requests],
        "jobs": [item.job_name for item in requests],
    }


@router.get("/system-status")
def system_status(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"api": "ok", "database": "ok", "mcp": mcp_status(db)}


@router.get("/data-sources")
def data_sources(db: Session = Depends(get_db)) -> list[dict[str, str | int | None]]:
    stock_count = db.scalar(text("SELECT COUNT(*) FROM stock")) or 0
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
    futu_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_futu_news").one_or_none()
    eastmoney_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_stock_news").one_or_none()
    stock_daily_bar_job = db.query(JobConfig).filter(JobConfig.job_name == "stock_analysis.sync_daily_bars").one_or_none()
    portfolio_snapshot_job = (
        db.query(JobConfig).filter(JobConfig.job_name == "portfolio.capture_daily_value_snapshot").one_or_none()
    )
    cninfo_disclosure_job = (
        db.query(JobConfig).filter(JobConfig.job_name == "disclosure_library.fetch_stock_announcements").one_or_none()
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
    latest_tushare_realtime_quote_time = db.scalar(
        db.query(func.max(PortfolioPosition.quote_time))
        .filter(PortfolioPosition.price_source == "tushare.get_realtime_quotes")
        .statement
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
            "key": "portfolio-realtime-quotes",
            "name": "实时行情（Tushare）",
            "module": "portfolio",
            "provider": "Tushare",
            "record_count": None,
            "status": portfolio_snapshot_job.last_status if portfolio_snapshot_job is not None else "unknown",
            "last_sync_at": _format_time(
                portfolio_snapshot_job.last_run_at
                if portfolio_snapshot_job is not None
                else latest_tushare_realtime_quote_time
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
            "key": "futu-news",
            "name": "信息流（富途牛牛）",
            "module": "market_radar",
            "provider": "富途官网快讯接口",
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


@router.get("/ai-logs/daily-usage")
def ai_log_daily_usage(
    days: int = Query(14, ge=1, le=90),
    db: Session = Depends(get_db),
) -> list[dict[str, int | str]]:
    return ai_request_log_daily_usage(db, days=days)


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
