from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.modules.knowledge_base.models import KnowledgePrompt
from invest_assistant.modules.knowledge_base.service import DEFAULT_KNOWLEDGE_PROMPTS, resolve_prompt_content
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.track_discovery import jobs as track_jobs
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial


REVIEW_JOB_NAME = "track_discovery.review_track_events_deepseek"


def make_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    import invest_assistant.modules.basic.auth.models  # noqa: F401
    import invest_assistant.modules.basic.ai_audit.models  # noqa: F401
    import invest_assistant.modules.basic.disclosure_library.models  # noqa: F401
    import invest_assistant.modules.basic.job_center.models  # noqa: F401
    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.basic.system_config.models  # noqa: F401
    import invest_assistant.modules.alert_center.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.market_radar.models  # noqa: F401
    import invest_assistant.modules.portfolio.models  # noqa: F401
    import invest_assistant.modules.stock_analysis.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def add_review_prompt(db, model: str = "deepseek-v4-pro") -> None:
    payload = next(item for item in DEFAULT_KNOWLEDGE_PROMPTS if item.prompt_key == REVIEW_JOB_NAME)
    data = payload.model_dump()
    data["model"] = model
    db.add(
        KnowledgePrompt(
            **data,
        )
    )
    db.commit()


def add_pending_materials(db) -> tuple[int, int]:
    track = Track(name="AI算力", status="active", description="AI基础设施赛道")
    db.add(track)
    db.flush()
    first_source = SourceItem(
        source_type="news",
        source_name="manual",
        title="云厂商扩大AI服务器采购",
        content="云厂商扩大AI服务器采购，带动算力基础设施需求。",
        publish_time=datetime(2026, 6, 1, 9, 30, tzinfo=timezone.utc),
    )
    second_source = SourceItem(
        source_type="news",
        source_name="manual",
        title="某园区举办AI主题沙龙",
        content="某园区举办AI主题沙龙，现场交流活跃。",
        publish_time=datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc),
    )
    db.add_all([first_source, second_source])
    db.flush()
    first = TrackMaterial(track_id=track.id, material_type="source_item", material_id=first_source.id, status="pending")
    second = TrackMaterial(track_id=track.id, material_type="source_item", material_id=second_source.id, status="pending")
    db.add_all([first, second])
    db.commit()
    return first.id, second.id


def test_default_prompt_and_job_definition_are_registered():
    prompt = next((item for item in DEFAULT_KNOWLEDGE_PROMPTS if item.prompt_key == REVIEW_JOB_NAME), None)
    assert prompt is not None
    assert prompt.title == "DeepSeek 赛道事件审核"
    assert prompt.provider == "deepseek"
    assert prompt.model == "deepseek-v4-pro"
    assert prompt.response_format == "json_object"
    assert prompt.system_prompt.endswith("/system.md")
    assert prompt.user_prompt.endswith("/user.md")
    assert "长期分析" in resolve_prompt_content(prompt).user_prompt

    job = next((item for item in track_jobs.JOBS if item.job_name == REVIEW_JOB_NAME), None)
    assert job is not None
    assert job.display_name == "AI审核赛道事件"
    assert job.module_name == "track_discovery"
    assert job.trigger_type == "manual"
    assert job.params_schema["batch_size"]["default"] == 20


def test_review_job_updates_pending_materials_from_deepseek(monkeypatch):
    SessionFactory = make_session_factory()
    db = SessionFactory()
    try:
        add_review_prompt(db)
        first_id, second_id = add_pending_materials(db)
    finally:
        db.close()

    captured_payloads = []

    def fake_review_track_materials(materials, prompt, model):
        captured_payloads.append((materials, prompt.prompt_key, model))
        return {
            "reviews": [
                {
                    "track_material_id": first_id,
                    "decision": "confirmed",
                    "direction": "support",
                    "importance_level": "high",
                    "note": "云厂商采购验证AI算力需求的长期景气。",
                },
                {
                    "track_material_id": second_id,
                    "decision": "ignored",
                    "reason": "主题沙龙无法形成赛道长期判断素材。",
                },
            ],
            "usage": {"prompt_tokens": 13, "completion_tokens": 9, "total_tokens": 22},
        }

    monkeypatch.setattr(track_jobs, "SessionLocal", SessionFactory)
    monkeypatch.setattr(track_jobs.deepseek_client, "review_track_materials", fake_review_track_materials)

    handler = getattr(track_jobs, "review_track_events_deepseek_job", None)
    assert handler is not None
    result = handler()

    assert result.success is True
    assert result.processed_count == 2
    assert result.updated_count == 2
    assert result.extra["confirmed_count"] == 1
    assert result.extra["ignored_count"] == 1
    assert captured_payloads[0][1:] == (REVIEW_JOB_NAME, "deepseek-v4-pro")
    assert captured_payloads[0][0][0]["track_material_id"] == first_id
    assert captured_payloads[0][0][0]["track_name"] == "AI算力"

    db = SessionFactory()
    try:
        first = db.get(TrackMaterial, first_id)
        second = db.get(TrackMaterial, second_id)
        assert first.status == "confirmed"
        assert first.direction == "support"
        assert first.importance_level == "high"
        assert first.note == "云厂商采购验证AI算力需求的长期景气。"
        assert second.status == "ignored"
        assert second.direction == "noise"
        assert second.importance_level == "low"
        assert second.note == "主题沙龙无法形成赛道长期判断素材。"
        log = db.query(AiRequestLog).one()
        assert log.provider == "deepseek"
        assert log.model == "deepseek-v4-pro"
        assert log.task_name == REVIEW_JOB_NAME
        assert log.status == "success"
        assert log.total_tokens == 22
    finally:
        db.close()


def test_review_job_fails_and_logs_when_prompt_is_missing(monkeypatch):
    SessionFactory = make_session_factory()
    db = SessionFactory()
    try:
        add_pending_materials(db)
    finally:
        db.close()

    monkeypatch.setattr(track_jobs, "SessionLocal", SessionFactory)
    monkeypatch.setattr(
        track_jobs.deepseek_client,
        "review_track_materials",
        lambda materials, prompt, model: (_ for _ in ()).throw(AssertionError("DeepSeek should not be called")),
    )

    handler = getattr(track_jobs, "review_track_events_deepseek_job", None)
    assert handler is not None
    result = handler()

    assert result.success is False
    assert "active prompt not found" in result.message
    db = SessionFactory()
    try:
        log = db.query(AiRequestLog).one()
        assert log.status == "failed"
        assert log.task_name == REVIEW_JOB_NAME
        assert "active prompt not found" in log.error_message
    finally:
        db.close()


def test_review_job_fails_and_preserves_pending_material_when_deepseek_fails(monkeypatch):
    SessionFactory = make_session_factory()
    db = SessionFactory()
    try:
        add_review_prompt(db)
        first_id, _second_id = add_pending_materials(db)
    finally:
        db.close()

    monkeypatch.setattr(track_jobs, "SessionLocal", SessionFactory)
    monkeypatch.setattr(
        track_jobs.deepseek_client,
        "review_track_materials",
        lambda materials, prompt, model: (_ for _ in ()).throw(RuntimeError("network down")),
    )

    handler = getattr(track_jobs, "review_track_events_deepseek_job", None)
    assert handler is not None
    result = handler(batch_size=1, max_items=1)

    assert result.success is False
    assert "network down" in result.message
    db = SessionFactory()
    try:
        material = db.get(TrackMaterial, first_id)
        assert material.status == "pending"
        log = db.query(AiRequestLog).one()
        assert log.status == "failed"
        assert "network down" in log.error_message
    finally:
        db.close()


def test_review_job_skips_without_calling_deepseek_when_no_pending_materials(monkeypatch):
    SessionFactory = make_session_factory()
    db = SessionFactory()
    try:
        add_review_prompt(db)
    finally:
        db.close()

    monkeypatch.setattr(track_jobs, "SessionLocal", SessionFactory)
    monkeypatch.setattr(
        track_jobs.deepseek_client,
        "review_track_materials",
        lambda materials, prompt, model: (_ for _ in ()).throw(AssertionError("DeepSeek should not be called")),
    )

    handler = getattr(track_jobs, "review_track_events_deepseek_job", None)
    assert handler is not None
    result = handler()

    assert result.success is True
    assert result.processed_count == 0
    assert result.skipped_count == 1
    db = SessionFactory()
    try:
        assert db.query(AiRequestLog).count() == 0
    finally:
        db.close()
