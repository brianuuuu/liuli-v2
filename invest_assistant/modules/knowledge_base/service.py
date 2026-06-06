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
DEEPSEEK_STOCK_EVENT_REVIEW_PROMPT_KEY = "stock_analysis.review_stock_events_deepseek"
DEEPSEEK_TRACK_EVENT_REVIEW_PROMPT_KEY = "track_discovery.review_track_events_deepseek"

LEGACY_DEEPSEEK_HOTWORD_SYSTEM_PROMPT = (
    "你是A股新闻热词标签抽取助手。只返回合法JSON，不要返回Markdown。"
    "你的目标是抽取可作为系统标签长期复用的热点新闻名词，不是复述新闻标题。"
)
LEGACY_DEEPSEEK_HOTWORD_USER_PROMPT = (
    "从以下今日新闻中抽取今日热点新闻名词，并给每个词按今日强度打0-10分。"
    "name必须是一个专有名词或实体名词，可直接作为标签使用，例如公司、品牌、人物、地点、产品、技术、政策、行业、资源品、正式事件名。"
    "不要返回新闻短句、标题摘要、主谓宾短语、带动作的描述、临时拼接词、泛化灾害词或无法长期复用的组合词。"
    "如果标题像“某地发生某事”，只保留真正可复用的名词；没有合格名词就跳过。"
    "name尽量短，中文通常2-8个字，英文保留官方写法；不要包含“供应、延误、爆炸、枪击、遇袭、火灾、强降雨”等单纯事件/动作/状态词，除非它们属于公认正式事件名的一部分。"
    "只输出JSON：{\"hotwords\":[{\"name\":\"热词\",\"score\":0,\"reason\":\"简短原因\"}]}。"
)
DEEPSEEK_HOTWORD_SYSTEM_PROMPT = (
    "你是A股市场新闻热词候选抽取助手。只返回合法JSON，不要返回Markdown。"
    "你的目标是抽取可长期复用、能服务投资研究的产业名词和市场专业信息，不是复述新闻标题。"
    "宁可少提，也不要把普通新闻名词、地名、人群、动作或一次性事件塞进候选池。"
)
DEEPSEEK_HOTWORD_USER_PROMPT = (
    "从以下今日新闻中抽取值得进入审核池的新闻热词候选，并给每个词按今日投资关注强度打0-10分。"
    "name必须是可独立复用的专业名词，优先选择：产业链环节、行业赛道、市场热词、新兴技术、"
    "关键产品或材料、政策工具、上市公司、核心品牌、企业家/重要管理者、投资主题、宏观交易主线。"
    "入选标准：看到这个词时，研究员能围绕它继续做产业、公司、政策、供需、竞争格局或投资假设分析。"
    "不要返回普通地名、泛称人群、普通岗位、新闻短句、标题摘要、主谓宾短语、带动作的描述、临时拼接词、"
    "单纯事件名、灾害事故词、情绪词、泛化概念或无法形成投资判断的名词。"
    "如果新闻只是在讲“某地发生某事”或“某人表态”，除非其中出现有投资研究价值的公司、技术、行业、政策或企业家，否则跳过。"
    "name尽量短，中文通常2-8个字，英文保留官方写法；不要包含“供应、延误、爆炸、枪击、遇袭、火灾、强降雨”等动作/状态词。"
    "reason用一句话说明它的产业、市场、公司或投资含义，不要复述标题。"
    "只输出JSON：{\"hotwords\":[{\"name\":\"热词\",\"score\":0,\"reason\":\"简短原因\"}]}。"
)
DEFAULT_KNOWLEDGE_PROMPTS = [
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_HOTWORD_PROMPT_KEY,
        title="DeepSeek 新闻热词候选",
        target_task=DEEPSEEK_HOTWORD_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-flash",
        system_prompt=DEEPSEEK_HOTWORD_SYSTEM_PROMPT,
        user_prompt=DEEPSEEK_HOTWORD_USER_PROMPT,
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
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_STOCK_EVENT_REVIEW_PROMPT_KEY,
        title="DeepSeek 标的事件审核",
        target_task=DEEPSEEK_STOCK_EVENT_REVIEW_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-pro",
        system_prompt=(
            "你是A股标的事件审核助手。只返回合法JSON，不要返回Markdown。"
            "你的任务是判断待处理标的事件是否值得纳入标的材料库，作为长期分析素材。"
        ),
        user_prompt=(
            "审核以下待处理标的事件。只有对公司长期经营、竞争格局、业绩兑现、估值逻辑、风险暴露、"
            "产业链地位或核心投资假设有持续分析价值的事件，才确认纳入材料库。"
            "判断标准是它是否适合作为长期分析素材。"
            "日常行政、无实质业务影响、重复、噪音或无法形成投资判断的事件应忽略。"
            "confirmed 必须给出 impact_direction=positive/negative/neutral/noise、"
            "importance_level=high/medium/low 和一句标的视角 note。"
            "ignored 可给出 reason。"
            "只输出JSON：{\"reviews\":[{\"stock_material_id\":1,\"decision\":\"confirmed\","
            "\"impact_direction\":\"positive\",\"importance_level\":\"high\",\"note\":\"一句话判断\"},"
            "{\"stock_material_id\":2,\"decision\":\"ignored\",\"reason\":\"忽略原因\"}]}。"
        ),
        response_format="json_object",
        status="active",
    ),
    KnowledgePromptCreate(
        prompt_key=DEEPSEEK_TRACK_EVENT_REVIEW_PROMPT_KEY,
        title="DeepSeek 赛道事件审核",
        target_task=DEEPSEEK_TRACK_EVENT_REVIEW_PROMPT_KEY,
        provider="deepseek",
        model="deepseek-v4-pro",
        system_prompt=(
            "你是A股赛道事件审核助手。只返回合法JSON，不要返回Markdown。"
            "你的任务是判断待处理赛道事件是否值得纳入赛道材料库，作为长期分析素材。"
        ),
        user_prompt=(
            "审核以下待处理赛道事件。只有对赛道长期景气度、产业趋势、供需格局、政策催化、"
            "竞争结构、商业化进展、风险暴露或核心投资假设有持续分析价值的事件，才确认纳入材料库。"
            "判断标准是它是否适合作为长期分析素材。"
            "日常活动、重复消息、无实质产业影响、泛化噪音或无法形成赛道判断的事件应忽略。"
            "confirmed 必须给出 direction=support/weaken/neutral/noise、"
            "importance_level=high/medium/low 和一句赛道视角 note。"
            "ignored 可给出 reason。"
            "只输出JSON：{\"reviews\":[{\"track_material_id\":1,\"decision\":\"confirmed\","
            "\"direction\":\"support\",\"importance_level\":\"high\",\"note\":\"一句话判断\"},"
            "{\"track_material_id\":2,\"decision\":\"ignored\",\"reason\":\"忽略原因\"}]}。"
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
    changed = 0
    for payload in DEFAULT_KNOWLEDGE_PROMPTS:
        existing = db.scalar(select(KnowledgePrompt).where(KnowledgePrompt.prompt_key == payload.prompt_key))
        if existing is not None:
            if _should_upgrade_legacy_hotword_prompt(existing):
                existing.system_prompt = DEEPSEEK_HOTWORD_SYSTEM_PROMPT
                existing.user_prompt = DEEPSEEK_HOTWORD_USER_PROMPT
                changed += 1
            continue
        db.add(KnowledgePrompt(**payload.model_dump()))
        changed += 1
    if changed:
        db.commit()
    return changed


def _should_upgrade_legacy_hotword_prompt(item: KnowledgePrompt) -> bool:
    return (
        item.prompt_key == DEEPSEEK_HOTWORD_PROMPT_KEY
        and item.system_prompt == LEGACY_DEEPSEEK_HOTWORD_SYSTEM_PROMPT
        and item.user_prompt == LEGACY_DEEPSEEK_HOTWORD_USER_PROMPT
    )


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
