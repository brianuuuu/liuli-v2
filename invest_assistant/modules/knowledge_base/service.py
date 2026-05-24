from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.knowledge_base.models import (
    KnowledgeAgent,
    KnowledgeFeedbackLog,
    KnowledgeNote,
    KnowledgePrompt,
    KnowledgeSkill,
)
from invest_assistant.modules.knowledge_base.schemas import (
    KnowledgeAgentCreate,
    KnowledgeNoteCreate,
    KnowledgePromptCreate,
    KnowledgeSkillCreate,
)

DEEPSEEK_HOTWORD_PROMPT_KEY = "market_radar.extract_daily_hotwords_deepseek"
DEFAULT_KNOWLEDGE_PROMPTS = [
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_HOTWORD_PROMPT_KEY,
        title="DeepSeek 新闻热词候选",
        target_task=DEEPSEEK_HOTWORD_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-flash",
        system_prompt="你是A股新闻热词抽取助手。只返回合法JSON，不要返回Markdown。",
        user_prompt=(
            "从以下今日新闻中抽取新闻热词，并给每个热词按今日强度打0-10分。"
            "只输出JSON：{\"hotwords\":[{\"name\":\"热词\",\"score\":0,\"reason\":\"简短原因\"}]}。"
        ),
        response_format="json_object",
        status="active",
    )
]


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


def create_prompt(db: Session, payload: KnowledgePromptCreate) -> KnowledgePrompt:
    item = KnowledgePrompt(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def ensure_default_prompts(db: Session) -> int:
    inserted = 0
    for payload in DEFAULT_KNOWLEDGE_PROMPTS:
        existing = db.scalar(select(KnowledgePrompt).where(KnowledgePrompt.prompt_key == payload.prompt_key))
        if existing is not None:
            continue
        db.add(KnowledgePrompt(**payload.model_dump()))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def list_prompts(db: Session) -> list[KnowledgePrompt]:
    return list(db.scalars(select(KnowledgePrompt).where(KnowledgePrompt.status != "deleted").order_by(KnowledgePrompt.id.desc())))


def get_prompt(db: Session, prompt_id: int) -> KnowledgePrompt | None:
    return db.get(KnowledgePrompt, prompt_id)


def get_active_prompt_by_key(db: Session, prompt_key: str) -> KnowledgePrompt | None:
    return db.scalar(select(KnowledgePrompt).where(KnowledgePrompt.prompt_key == prompt_key, KnowledgePrompt.status == "active"))


def update_prompt(db: Session, item: KnowledgePrompt, payload: KnowledgePromptCreate) -> KnowledgePrompt:
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_prompt(db: Session, item: KnowledgePrompt) -> KnowledgePrompt:
    item.status = "deleted"
    db.commit()
    db.refresh(item)
    return item


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
