from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.track_discovery import service


def generate_candidates_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.generate_candidates_job(db)
    finally:
        db.close()


def collect_materials_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.collect_materials_job(db)
    finally:
        db.close()


def refresh_bound_stocks_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.refresh_bound_stocks_job(db)
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
        job_name="track_discovery.collect_materials",
        module_name="track_discovery",
        display_name="收集赛道材料",
        description="赛道材料由信息流、知识笔记和人工判断写入 track_material",
        handler=collect_materials_job,
        trigger_type="manual",
    ),
    JobDefinition(
        job_name="track_discovery.refresh_bound_stocks",
        module_name="track_discovery",
        display_name="刷新赛道绑定标的",
        description="标的绑定统一由 stock_track_relation 维护",
        handler=refresh_bound_stocks_job,
        trigger_type="manual",
    ),
]
