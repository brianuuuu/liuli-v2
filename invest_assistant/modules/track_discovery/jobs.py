from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.track_discovery import service


def generate_candidates_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.generate_candidates_job(db)
    finally:
        db.close()


def collect_evidence_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.collect_evidence_job(db)
    finally:
        db.close()


def refresh_related_stocks_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.refresh_related_stocks_job(db)
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name="track_discovery.generate_candidates",
        module_name="track_discovery",
        display_name="生成候选赛道",
        description="从市场雷达 track 标签热度生成候选赛道",
        handler=generate_candidates_job,
        trigger_type="manual",
    ),
    JobDefinition(
        job_name="track_discovery.collect_evidence",
        module_name="track_discovery",
        display_name="收集赛道证据",
        description="阶段 4 保留任务入口，证据主要由用户和业务模块手动写入",
        handler=collect_evidence_job,
        trigger_type="manual",
    ),
    JobDefinition(
        job_name="track_discovery.refresh_related_stocks",
        module_name="track_discovery",
        display_name="刷新赛道相关标的",
        description="阶段 4 保留任务入口，相关标的主要由用户手动维护",
        handler=refresh_related_stocks_job,
        trigger_type="manual",
    ),
]
