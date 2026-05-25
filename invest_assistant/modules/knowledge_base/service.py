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
DEEPSEEK_HOTWORD_MERGE_PROMPT_KEY = "market_radar.suggest_hotword_merges_deepseek"
DEFAULT_KNOWLEDGE_PROMPTS = [
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_HOTWORD_PROMPT_KEY,
        title="DeepSeek 新闻热词候选",
        target_task=DEEPSEEK_HOTWORD_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-flash",
        system_prompt=(
            "你是A股新闻热词标签抽取助手。只返回合法JSON，不要返回Markdown。"
            "你的目标是抽取可作为系统标签长期复用的热点新闻名词，不是复述新闻标题。"
        ),
        user_prompt=(
            "从以下今日新闻中抽取今日热点新闻名词，并给每个词按今日强度打0-10分。"
            "name必须是一个专有名词或实体名词，可直接作为标签使用，例如公司、品牌、人物、地点、产品、技术、政策、行业、资源品、正式事件名。"
            "不要返回新闻短句、标题摘要、主谓宾短语、带动作的描述、临时拼接词、泛化灾害词或无法长期复用的组合词。"
            "如果标题像“某地发生某事”，只保留真正可复用的名词；没有合格名词就跳过。"
            "name尽量短，中文通常2-8个字，英文保留官方写法；不要包含“供应、延误、爆炸、枪击、遇袭、火灾、强降雨”等单纯事件/动作/状态词，除非它们属于公认正式事件名的一部分。"
            "只输出JSON：{\"hotwords\":[{\"name\":\"热词\",\"score\":0,\"reason\":\"简短原因\"}]}。"
        ),
        response_format="json_object",
        status="active",
    ),
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_HOTWORD_MERGE_PROMPT_KEY,
        title="DeepSeek 热词近义合并建议",
        target_task=DEEPSEEK_HOTWORD_MERGE_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-flash",
        system_prompt=(
            "你是A股热点词近义归并助手。只返回合法JSON，不要返回Markdown。"
            "你的任务是判断候选热点词是否应作为已有热点词的别名。"
        ),
        user_prompt=(
            "根据候选词和已有热点词列表，找出语义上可归并为同一标签的候选词。"
            "只有候选词与目标词可互作别名时才返回建议；仅相关、上下游、同赛道、同事件背景但不是同义表达时不要建议。"
            "返回JSON：{\"suggestions\":[{\"candidate_name\":\"候选词\",\"target_tag_id\":1,\"similarity\":0.0,\"reason\":\"简短原因\"}]}。"
        ),
        response_format="json_object",
        status="active",
    ),
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
