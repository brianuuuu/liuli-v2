from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.portfolio import adjust_advice, service


CAPTURE_DAILY_VALUE_SNAPSHOT_JOB_NAME = "portfolio.capture_daily_value_snapshot"
REFRESH_ALL_REALTIME_QUOTES_JOB_NAME = "portfolio.refresh_all_realtime_quotes"
EVALUATE_ADJUST_ADVICE_JOB_NAME = "portfolio.evaluate_adjust_advice"


def capture_daily_value_snapshot_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        result = service.capture_daily_value_snapshots(db, source="scheduled")
        warning_count = len(result["warnings"])
        return JobResult(
            success=True,
            message=f"captured {result['processed_count']} portfolio value snapshots",
            processed_count=result["processed_count"],
            updated_count=result["updated_count"],
            skipped_count=warning_count,
            extra=result,
        )
    finally:
        db.close()


def refresh_all_realtime_quotes_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        result = service.refresh_portfolio_realtime_quotes(db)
        warning_count = len(result["warnings"])
        return JobResult(
            success=True,
            message=f"refreshed {result['updated_count']} portfolio positions",
            processed_count=result["processed_count"],
            updated_count=result["updated_count"],
            skipped_count=warning_count,
            extra=result,
        )
    finally:
        db.close()


def evaluate_adjust_advice_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        result = adjust_advice.evaluate_adjust_advice(db)
        return JobResult(
            success=True,
            message=f"evaluated {result['updated_count']} of {result['processed_count']} adjust advice items",
            processed_count=result["processed_count"],
            updated_count=result["updated_count"],
            extra=result,
        )
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name=REFRESH_ALL_REALTIME_QUOTES_JOB_NAME,
        module_name="portfolio",
        display_name="刷新全部组合实时行情",
        description="异步刷新全部组合持仓实时行情缓存，不保存每日市值快照",
        handler=refresh_all_realtime_quotes_job,
        trigger_type="manual",
        timeout_seconds=900,
        max_retries=0,
        tags=["portfolio", "realtime_quote", "tushare"],
    ),
    JobDefinition(
        job_name=CAPTURE_DAILY_VALUE_SNAPSHOT_JOB_NAME,
        module_name="portfolio",
        display_name="保存组合每日市值快照",
        description="每天下午五点刷新组合实时价格，并保存包含现金的组合总市值快照",
        handler=capture_daily_value_snapshot_job,
        trigger_type="both",
        cron_expr="0 17 * * *",
        timeout_seconds=900,
        max_retries=1,
        tags=["portfolio", "snapshot", "cash"],
    ),
    JobDefinition(
        job_name=EVALUATE_ADJUST_ADVICE_JOB_NAME,
        module_name="portfolio",
        display_name="评估微操建议",
        description="按沪深300 交易日对到期的微操建议计算执行、触及、5/20/60 日收益和对错，排在 18:30 日线同步之后",
        handler=evaluate_adjust_advice_job,
        trigger_type="both",
        cron_expr="15 19 * * 1-5",
        timeout_seconds=600,
        max_retries=1,
        tags=["portfolio", "adjust_advice", "review"],
    ),
]
