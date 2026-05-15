from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.modules.basic.job_center.types import JobDefinition, JobResult
from invest_assistant.modules.knowledge_base import service


def extract_skills_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.extract_skills(db)
    finally:
        db.close()


def compile_agents_job(**kwargs) -> JobResult:
    db = SessionLocal()
    try:
        return service.compile_agents(db)
    finally:
        db.close()


JOBS = [
    JobDefinition(
        job_name="knowledge_base.extract_skills",
        module_name="knowledge_base",
        display_name="提炼知识 Skills",
        description="从知识笔记中提炼可复用分析准则",
        handler=extract_skills_job,
        trigger_type="manual",
    ),
    JobDefinition(
        job_name="knowledge_base.compile_agents",
        module_name="knowledge_base",
        display_name="编排知识 Agents",
        description="编排知识 Skills 为可执行分析流程",
        handler=compile_agents_job,
        trigger_type="manual",
    ),
]
