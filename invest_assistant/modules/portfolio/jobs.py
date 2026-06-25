from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.portfolio import service


CAPTURE_DAILY_VALUE_SNAPSHOT_JOB_NAME = "portfolio.capture_daily_value_snapshot"


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


JOBS = [
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
    )
]
