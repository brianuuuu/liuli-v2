from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from invest_assistant.modules.knowledge_base.models import KnowledgePrompt
from invest_assistant.modules.knowledge_base import service as knowledge_service
from invest_assistant.modules.knowledge_base.schemas import KnowledgePromptCreate
from invest_assistant.modules.knowledge_base.service import (
    DEEPSEEK_HOTWORD_PROMPT_KEY,
    DEEPSEEK_MARKET_DAILY_REPORT_PROMPT_KEY,
    DEFAULT_KNOWLEDGE_PROMPTS,
    ensure_default_prompts,
    get_active_prompt_by_key,
    resolve_prompt_content,
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
    resolved = resolve_prompt_content(prompt)

    assert prompt.system_prompt.endswith("/system.md")
    assert prompt.user_prompt.endswith("/user.md")
    assert "产业名词" in resolved.system_prompt
    assert "投资研究" in resolved.system_prompt
    assert "产业链" in resolved.user_prompt
    assert "市场热词" in resolved.user_prompt
    assert "新兴技术" in resolved.user_prompt
    assert "上市公司" in resolved.user_prompt
    assert "企业家" in resolved.user_prompt
    assert "投资主题" in resolved.user_prompt
    assert "普通地名" in resolved.user_prompt
    assert "泛称人群" in resolved.user_prompt
    assert "单纯事件名" in resolved.user_prompt


def test_default_prompt_rows_store_paths_and_runtime_resolves_content():
    engine = create_engine("sqlite:///:memory:")
    KnowledgePrompt.__table__.create(bind=engine)

    with Session(engine) as db:
        ensure_default_prompts(db)

        stored = db.query(KnowledgePrompt).filter(KnowledgePrompt.prompt_key == DEEPSEEK_HOTWORD_PROMPT_KEY).one()
        assert stored.system_prompt.endswith("/system.md")
        assert stored.user_prompt.endswith("/user.md")

        resolved = get_active_prompt_by_key(db, DEEPSEEK_HOTWORD_PROMPT_KEY)
        assert resolved is not None
        assert "产业链" in resolved.user_prompt
        assert stored.user_prompt.endswith("/user.md")


def test_existing_prompt_rows_are_switched_to_default_paths():
    engine = create_engine("sqlite:///:memory:")
    KnowledgePrompt.__table__.create(bind=engine)

    with Session(engine) as db:
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
        assert changed_count == len(DEFAULT_KNOWLEDGE_PROMPTS)
        assert updated.title == "用户自定义标题"
        assert updated.system_prompt.endswith("/system.md")
        assert updated.user_prompt.endswith("/user.md")


def test_existing_custom_inline_prompt_is_migrated_to_files(tmp_path, monkeypatch):
    prompt_root = tmp_path / "invest_assistant" / "modules" / "knowledge_base" / "prompts"
    monkeypatch.setattr(knowledge_service, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(knowledge_service, "PROMPT_ROOT", prompt_root)

    engine = create_engine("sqlite:///:memory:")
    KnowledgePrompt.__table__.create(bind=engine)

    with Session(engine) as db:
        db.add(
            KnowledgePrompt(
                prompt_key="custom.prompt.test",
                title="自定义标题",
                target_task="custom.prompt.test",
                provider="deepseek",
                model="deepseek-v4-flash",
                system_prompt="旧系统正文",
                user_prompt="旧用户正文",
                response_format="json_object",
                status="active",
            )
        )
        db.commit()

        changed_count = knowledge_service.ensure_default_prompts(db)

        migrated = db.query(KnowledgePrompt).filter(KnowledgePrompt.prompt_key == "custom.prompt.test").one()
        assert changed_count == len(knowledge_service.DEFAULT_KNOWLEDGE_PROMPTS) + 1
        assert migrated.system_prompt.endswith("/custom/prompt/test/system.md")
        assert migrated.user_prompt.endswith("/custom/prompt/test/user.md")
        assert (tmp_path / migrated.system_prompt).read_text(encoding="utf-8") == "旧系统正文"
        assert knowledge_service.get_active_prompt_by_key(db, "custom.prompt.test").user_prompt == "旧用户正文"


def test_market_daily_report_prompt_paths_resolve_and_render_variables():
    engine = create_engine("sqlite:///:memory:")
    KnowledgePrompt.__table__.create(bind=engine)

    with Session(engine) as db:
        ensure_default_prompts(db)

        stored = db.query(KnowledgePrompt).filter(
            KnowledgePrompt.prompt_key == DEEPSEEK_MARKET_DAILY_REPORT_PROMPT_KEY
        ).one()
        assert stored.system_prompt.endswith("/system.md")
        assert stored.user_prompt.endswith("/user.md")

        resolved = get_active_prompt_by_key(
            db,
            DEEPSEEK_MARKET_DAILY_REPORT_PROMPT_KEY,
            variables={"report_date": "2026-06-13"},
        )
        assert resolved is not None
        assert "琉璃系统的市场雷达分析员" in resolved.system_prompt
        assert "# 市场雷达日报｜2026-06-13" in resolved.user_prompt
        assert "外部参考" in resolved.user_prompt


def test_prompt_crud_writes_files_and_keeps_paths_in_database(tmp_path, monkeypatch):
    prompt_root = tmp_path / "invest_assistant" / "modules" / "knowledge_base" / "prompts"
    monkeypatch.setattr(knowledge_service, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(knowledge_service, "PROMPT_ROOT", prompt_root)

    engine = create_engine("sqlite:///:memory:")
    KnowledgePrompt.__table__.create(bind=engine)

    with Session(engine) as db:
        created = knowledge_service.create_prompt(
            db,
            KnowledgePromptCreate(
                prompt_key="custom.prompt.test",
                title="自定义 Prompt",
                target_task="custom.prompt.test",
                provider="deepseek",
                model="deepseek-v4-flash",
                system_prompt="系统正文 {{ name }}",
                user_prompt="用户正文",
                response_format="json_object",
                status="active",
            ),
        )

        stored = db.query(KnowledgePrompt).filter(KnowledgePrompt.prompt_key == "custom.prompt.test").one()
        assert created.system_prompt == "系统正文 {{ name }}"
        assert created.user_prompt == "用户正文"
        assert stored.system_prompt.endswith("/custom/prompt/test/system.md")
        assert stored.user_prompt.endswith("/custom/prompt/test/user.md")
        assert (tmp_path / stored.system_prompt).read_text(encoding="utf-8") == "系统正文 {{ name }}"

        resolved = knowledge_service.get_active_prompt_by_key(db, "custom.prompt.test", variables={"name": "琉璃"})
        assert resolved.system_prompt == "系统正文 琉璃"

        updated = knowledge_service.update_prompt(
            db,
            stored,
            KnowledgePromptCreate(
                prompt_key="custom.prompt.test",
                title="自定义 Prompt",
                target_task="custom.prompt.test",
                provider="deepseek",
                model="deepseek-v4-flash",
                system_prompt="新的系统正文",
                user_prompt="新的用户正文",
                response_format="json_object",
                status="active",
            ),
        )

        db.refresh(stored)
        assert updated.system_prompt == "新的系统正文"
        assert stored.system_prompt.endswith("/custom/prompt/test/system.md")
        assert (tmp_path / stored.system_prompt).read_text(encoding="utf-8") == "新的系统正文"
