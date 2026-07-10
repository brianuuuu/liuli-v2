from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.system_config.service import get_runtime_state
from invest_assistant.modules.market_radar import jobs as market_jobs
from invest_assistant.modules.market_radar.models import AiTagSuggestion, SourceItem, Tag
from invest_assistant.modules.stock_analysis import jobs as stock_jobs
from invest_assistant.modules.track_discovery import jobs as track_jobs


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


def add_news(db, title: str, publish_time: datetime | None = None) -> SourceItem:
    item = SourceItem(
        source_type="news",
        source_name="manual",
        title=title,
        content=f"{title} 内容",
        publish_time=publish_time or datetime(2026, 6, 20, 9, 0, tzinfo=timezone.utc),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def install_hotword_job_fakes(monkeypatch, SessionLocal, calls: list[list[str]]) -> None:
    monkeypatch.setattr(market_jobs, "SessionLocal", SessionLocal)
    monkeypatch.setattr(
        market_jobs,
        "get_active_prompt_by_key",
        lambda db, key: type("Prompt", (), {"model": "deepseek-v4-flash"})(),
    )
    def extract_hotwords(news, prompt, model):
        calls.append([item["title"] for item in news])
        return {
            "hotwords": [
                {"name": f"候选-{len(calls)}-{index}", "score": 8, "reason": "测试"}
                for index, _item in enumerate(news, start=1)
            ],
            "usage": {},
        }

    monkeypatch.setattr(market_jobs.deepseek_client, "extract_hotwords", extract_hotwords)


def test_hotword_job_uses_source_item_id_watermark_for_same_day_incremental_runs(monkeypatch):
    SessionLocal = make_session_factory()
    calls: list[list[str]] = []
    install_hotword_job_fakes(monkeypatch, SessionLocal, calls)
    db = SessionLocal()
    try:
        first = add_news(db, "第一条新闻")
        second = add_news(db, "第二条新闻")

        first_result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-20")

        third = add_news(db, "第三条新闻")
        second_result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-20")

        state = get_runtime_state(db, market_jobs.DAILY_HOTWORD_STATE_NAMESPACE, market_jobs.HOTWORD_SOURCE_ITEM_CURSOR_KEY)
        names = list(db.scalars(select(AiTagSuggestion.suggested_text).order_by(AiTagSuggestion.id.asc())))
        assert first_result.success
        assert first_result.processed_count == 2
        assert second_result.success
        assert second_result.processed_count == 1
        assert calls == [["第二条新闻", "第一条新闻"], ["第三条新闻"]]
        assert state is not None
        assert state.state_value == str(third.id)
        assert names == ["候选-1-1", "候选-1-2", "候选-2-1"]
        assert int(state.state_value) > second.id > first.id
    finally:
        db.close()


def test_hotword_job_skips_without_calling_deepseek_when_no_news_after_watermark(monkeypatch):
    SessionLocal = make_session_factory()
    calls: list[list[str]] = []
    install_hotword_job_fakes(monkeypatch, SessionLocal, calls)
    db = SessionLocal()
    try:
        latest = add_news(db, "唯一新闻")

        first_result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-20")
        second_result = market_jobs.extract_daily_hotwords_deepseek_job()

        state = get_runtime_state(db, market_jobs.DAILY_HOTWORD_STATE_NAMESPACE, market_jobs.HOTWORD_SOURCE_ITEM_CURSOR_KEY)
        assert first_result.processed_count == 1
        assert second_result.success
        assert second_result.processed_count == 0
        assert second_result.skipped_count == 1
        assert calls == [["唯一新闻"]]
        assert state is not None
        assert state.state_value == str(latest.id)
    finally:
        db.close()


def test_hotword_job_ignore_watermark_reprocesses_but_keeps_id_cursor(monkeypatch):
    SessionLocal = make_session_factory()
    calls: list[list[str]] = []
    install_hotword_job_fakes(monkeypatch, SessionLocal, calls)
    db = SessionLocal()
    try:
        latest = add_news(db, "可重跑新闻")

        first_result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-20")
        second_result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-20", ignore_watermark=True)

        state = get_runtime_state(db, market_jobs.DAILY_HOTWORD_STATE_NAMESPACE, market_jobs.HOTWORD_SOURCE_ITEM_CURSOR_KEY)
        assert first_result.processed_count == 1
        assert second_result.success
        assert second_result.processed_count == 1
        assert second_result.inserted_count == 1
        assert calls == [["可重跑新闻"], ["可重跑新闻"]]
        assert state is not None
        assert state.state_value == str(latest.id)
    finally:
        db.close()


def test_hotword_job_skips_name_that_already_exists_as_active_tag(monkeypatch):
    SessionLocal = make_session_factory()
    monkeypatch.setattr(market_jobs, "SessionLocal", SessionLocal)
    monkeypatch.setattr(
        market_jobs,
        "get_active_prompt_by_key",
        lambda db, key: type("Prompt", (), {"model": "deepseek-v4-flash"})(),
    )

    def extract_hotwords(news, prompt, model):
        return {
            "hotwords": [{"name": "已有启动标签", "score": 8, "reason": "测试"}],
            "usage": {},
        }

    monkeypatch.setattr(market_jobs.deepseek_client, "extract_hotwords", extract_hotwords)
    db = SessionLocal()
    try:
        db.add(Tag(name="已有启动标签", type="stock", source="manual", status="active"))
        db.commit()
        add_news(db, "包含已有启动标签的新闻")

        result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-20")

        names = list(db.scalars(select(AiTagSuggestion.suggested_text).order_by(AiTagSuggestion.id.asc())))
        assert result.success
        assert result.inserted_count == 0
        assert names == []
    finally:
        db.close()


@pytest.mark.parametrize(
    ("status", "expected_rejected_count"),
    [
        ("pending", 0),
        ("approved", 0),
        ("rejected", 3),
    ],
)
def test_hotword_job_skips_names_that_already_exist_as_ai_suggestions(monkeypatch, status, expected_rejected_count):
    SessionLocal = make_session_factory()
    monkeypatch.setattr(market_jobs, "SessionLocal", SessionLocal)
    monkeypatch.setattr(
        market_jobs,
        "get_active_prompt_by_key",
        lambda db, key: type("Prompt", (), {"model": "deepseek-v4-flash"})(),
    )

    def extract_hotwords(news, prompt, model):
        return {
            "hotwords": [{"name": "历史推荐词", "score": 8, "reason": "测试"}],
            "usage": {},
        }

    monkeypatch.setattr(market_jobs.deepseek_client, "extract_hotwords", extract_hotwords)
    db = SessionLocal()
    try:
        db.add(
            AiTagSuggestion(
                suggested_text="历史推荐词",
                score=7.0,
                status=status,
                rejected_count=2 if status == "rejected" else 0,
            )
        )
        db.commit()
        add_news(db, "包含历史推荐词的新闻")

        result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-20")

        rows = list(db.scalars(select(AiTagSuggestion).order_by(AiTagSuggestion.id.asc())))
        assert result.success
        assert result.inserted_count == 0
        assert result.skipped_count == 1
        assert len(rows) == 1
        assert rows[0].status == status
        assert rows[0].rejected_count == expected_rejected_count
    finally:
        db.close()


def test_hotword_job_does_not_advance_cursor_when_deepseek_fails(monkeypatch):
    SessionLocal = make_session_factory()
    monkeypatch.setattr(market_jobs, "SessionLocal", SessionLocal)
    monkeypatch.setattr(
        market_jobs,
        "get_active_prompt_by_key",
        lambda db, key: type("Prompt", (), {"model": "deepseek-v4-flash"})(),
    )

    def fail_extract_hotwords(news, prompt, model):
        raise RuntimeError("deepseek unavailable")

    monkeypatch.setattr(market_jobs.deepseek_client, "extract_hotwords", fail_extract_hotwords)
    db = SessionLocal()
    try:
        add_news(db, "失败新闻")

        result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-20")

        state = get_runtime_state(db, market_jobs.DAILY_HOTWORD_STATE_NAMESPACE, market_jobs.HOTWORD_SOURCE_ITEM_CURSOR_KEY)
        assert result.success is False
        assert state is None
    finally:
        db.close()


def test_only_id_backed_jobs_expose_ignore_watermark():
    definitions = [*market_jobs.JOBS, *stock_jobs.JOBS, *track_jobs.JOBS]
    watermark_jobs = {
        definition.job_name
        for definition in definitions
        if "ignore_watermark" in (definition.params_schema or {})
    }

    assert watermark_jobs == {
        market_jobs.DEEPSEEK_HOTWORD_JOB_NAME,
        stock_jobs.REVIEW_STOCK_EVENTS_JOB_NAME,
        track_jobs.REVIEW_TRACK_EVENTS_JOB_NAME,
    }
