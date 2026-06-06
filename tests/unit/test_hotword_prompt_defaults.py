from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from invest_assistant.modules.knowledge_base.models import KnowledgePrompt
from invest_assistant.modules.knowledge_base.service import (
    DEEPSEEK_HOTWORD_PROMPT_KEY,
    DEFAULT_KNOWLEDGE_PROMPTS,
    ensure_default_prompts,
)


OLD_HOTWORD_SYSTEM_PROMPT = (
    "你是A股新闻热词标签抽取助手。只返回合法JSON，不要返回Markdown。"
    "你的目标是抽取可作为系统标签长期复用的热点新闻名词，不是复述新闻标题。"
)

OLD_HOTWORD_USER_PROMPT = (
    "从以下今日新闻中抽取今日热点新闻名词，并给每个词按今日强度打0-10分。"
    "name必须是一个专有名词或实体名词，可直接作为标签使用，例如公司、品牌、人物、地点、产品、技术、政策、行业、资源品、正式事件名。"
    "不要返回新闻短句、标题摘要、主谓宾短语、带动作的描述、临时拼接词、泛化灾害词或无法长期复用的组合词。"
    "如果标题像“某地发生某事”，只保留真正可复用的名词；没有合格名词就跳过。"
    "name尽量短，中文通常2-8个字，英文保留官方写法；不要包含“供应、延误、爆炸、枪击、遇袭、火灾、强降雨”等单纯事件/动作/状态词，除非它们属于公认正式事件名的一部分。"
    "只输出JSON：{\"hotwords\":[{\"name\":\"热词\",\"score\":0,\"reason\":\"简短原因\"}]}。"
)


def _hotword_prompt():
    return next(item for item in DEFAULT_KNOWLEDGE_PROMPTS if item.prompt_key == DEEPSEEK_HOTWORD_PROMPT_KEY)


def test_hotword_prompt_prefers_investable_industry_terms():
    prompt = _hotword_prompt()

    assert "产业名词" in prompt.system_prompt
    assert "投资研究" in prompt.system_prompt
    assert "产业链" in prompt.user_prompt
    assert "市场热词" in prompt.user_prompt
    assert "新兴技术" in prompt.user_prompt
    assert "上市公司" in prompt.user_prompt
    assert "企业家" in prompt.user_prompt
    assert "投资主题" in prompt.user_prompt
    assert "普通地名" in prompt.user_prompt
    assert "泛称人群" in prompt.user_prompt
    assert "单纯事件名" in prompt.user_prompt


def test_legacy_default_hotword_prompt_is_upgraded_without_overwriting_custom_prompt():
    engine = create_engine("sqlite:///:memory:")
    KnowledgePrompt.__table__.create(bind=engine)

    with Session(engine) as db:
        for payload in DEFAULT_KNOWLEDGE_PROMPTS:
            if payload.prompt_key == DEEPSEEK_HOTWORD_PROMPT_KEY:
                continue
            db.add(KnowledgePrompt(**payload.model_dump()))
        db.add(
            KnowledgePrompt(
                prompt_key=DEEPSEEK_HOTWORD_PROMPT_KEY,
                title="用户自定义标题",
                target_task=DEEPSEEK_HOTWORD_PROMPT_KEY,
                provider="deepseek",
                model="deepseek-v4-flash",
                system_prompt=OLD_HOTWORD_SYSTEM_PROMPT,
                user_prompt=OLD_HOTWORD_USER_PROMPT,
                response_format="json_object",
                status="active",
            )
        )
        db.commit()

        changed_count = ensure_default_prompts(db)

        updated = db.query(KnowledgePrompt).filter(KnowledgePrompt.prompt_key == DEEPSEEK_HOTWORD_PROMPT_KEY).one()
        assert changed_count == 1
        assert updated.title == "用户自定义标题"
        assert "产业链" in updated.user_prompt

        updated.user_prompt = "用户已经自定义过的 Prompt"
        db.commit()

        changed_count = ensure_default_prompts(db)

        preserved = db.query(KnowledgePrompt).filter(KnowledgePrompt.prompt_key == DEEPSEEK_HOTWORD_PROMPT_KEY).one()
        assert changed_count == 0
        assert preserved.user_prompt == "用户已经自定义过的 Prompt"
