from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.knowledge_base.models import (
    KnowledgeAgent,
    KnowledgeFeedbackLog,
    KnowledgeNote,
    KnowledgeSkill,
)
from invest_assistant.modules.knowledge_base.schemas import (
    KnowledgeAgentCreate,
    KnowledgeNoteCreate,
    KnowledgeSkillCreate,
)


def create_note(db: Session, payload: KnowledgeNoteCreate) -> KnowledgeNote:
    item = KnowledgeNote(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_notes(db: Session) -> list[KnowledgeNote]:
    return list(db.scalars(select(KnowledgeNote).order_by(KnowledgeNote.id.desc())))


def create_skill(db: Session, payload: KnowledgeSkillCreate) -> KnowledgeSkill:
    item = KnowledgeSkill(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_skills(db: Session) -> list[KnowledgeSkill]:
    return list(db.scalars(select(KnowledgeSkill).order_by(KnowledgeSkill.id.desc())))


def create_agent(db: Session, payload: KnowledgeAgentCreate) -> KnowledgeAgent:
    item = KnowledgeAgent(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_agents(db: Session) -> list[KnowledgeAgent]:
    return list(db.scalars(select(KnowledgeAgent).order_by(KnowledgeAgent.id.desc())))


def get_agent(db: Session, agent_id: int) -> KnowledgeAgent | None:
    return db.get(KnowledgeAgent, agent_id)


def run_agent(db: Session, agent: KnowledgeAgent) -> KnowledgeFeedbackLog:
    log = KnowledgeFeedbackLog(
        agent_id=agent.id,
        target_module=agent.target_module,
        target_id=None,
        feedback_type="agent_run",
        result_summary=f"agent {agent.name} queued feedback for {agent.target_module}",
        effectiveness=None,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_feedback_logs(db: Session) -> list[KnowledgeFeedbackLog]:
    return list(db.scalars(select(KnowledgeFeedbackLog).order_by(KnowledgeFeedbackLog.id.desc())))


def extract_skills(db: Session) -> JobResult:
    notes = list_notes(db)
    return JobResult(success=True, message=f"processed {len(notes)} knowledge notes", processed_count=len(notes))


def compile_agents(db: Session) -> JobResult:
    agents = list_agents(db)
    return JobResult(success=True, message=f"compiled {len(agents)} knowledge agents", processed_count=len(agents))
