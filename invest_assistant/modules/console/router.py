from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.ai_audit.service import list_ai_request_logs
from invest_assistant.modules.basic.job_center.models import JobConfig
from invest_assistant.modules.market_radar.models import SourceItem

router = APIRouter(prefix="/api/console", tags=["console"], dependencies=[Depends(get_current_user)])


def _format_time(value) -> str | None:
    return value.isoformat() if value is not None else None


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

    stock_job = db.query(JobConfig).filter(JobConfig.job_name == "stock_master.sync_stock_basic").one_or_none()
    news_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_news").one_or_none()
    futu_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_futu_news").one_or_none()
    eastmoney_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_stock_news").one_or_none()

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


@router.get("/ai-logs")
def ai_logs(db: Session = Depends(get_db)) -> list[dict]:
    return [
        {
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
        for item in list_ai_request_logs(db)
    ]
