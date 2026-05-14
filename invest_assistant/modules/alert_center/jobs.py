from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.alert_center import service
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult


def evaluate_rules_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.evaluate_rules(db)
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name="alert_center.evaluate_rules",
        module_name="alert_center",
        display_name="执行预警规则",
        description="评估已启用的预警规则并生成预警事件",
        handler=evaluate_rules_job,
        trigger_type="manual",
    )
]
