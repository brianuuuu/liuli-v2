from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult


def sync_stock_basic_job(**kwargs) -> JobResult:
    return JobResult(success=True, message="stock sync is not implemented in phase 1")


JOBS = [
    JobDefinition(
        job_name="stock_master.sync_stock_basic",
        module_name="stock_master",
        display_name="同步股票基础库",
        description="阶段 1 仅注册任务定义，真实 AkShare 同步在后续阶段实现",
        handler=sync_stock_basic_job,
        trigger_type="manual",
    )
]
