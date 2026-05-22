from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.job_center.models import JobConfig
from invest_assistant.modules.market_radar.models import SourceItem

router = APIRouter(prefix="/api/console", tags=["console"], dependencies=[Depends(get_current_user)])


def _format_time(value) -> str | None:
    return value.isoformat() if value is not None else None


@router.get("/dashboard")
def dashboard() -> dict[str, str]:
    return {"status": "ok"}


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
    stock_job = db.query(JobConfig).filter(JobConfig.job_name == "stock_master.sync_stock_basic").one_or_none()
    news_job = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_news").one_or_none()
    latest_cls_time = db.scalar(
        db.query(func.max(SourceItem.publish_time))
        .filter(SourceItem.source_type == "news", SourceItem.source_name == "财联社")
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
    ]


@router.get("/ai-logs")
def ai_logs() -> list[dict[str, str]]:
    return []
