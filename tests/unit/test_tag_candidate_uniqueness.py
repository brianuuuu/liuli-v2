from uuid import uuid4
from pathlib import Path
import os
import subprocess
import sys

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.market_radar import jobs as market_radar_jobs
from invest_assistant.modules.market_radar.models import AiTagSuggestion, SourceItem
from invest_assistant.modules.market_radar.schemas import AiTagSuggestionCreate
from invest_assistant.modules.market_radar.service import create_ai_tag_suggestion, reject_ai_tag_suggestion, restore_ai_tag_suggestion

TEST_DB_ROOT = Path("var/cache/test-ai-tag-suggestions")


def make_session(name: str):
    TEST_DB_ROOT.mkdir(parents=True, exist_ok=True)
    db_path = TEST_DB_ROOT / f"{name}-{uuid4()}.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def test_ai_tag_suggestions_do_not_require_business_type():
    SessionLocal = make_session("service")
    db = SessionLocal()
    try:
        create_ai_tag_suggestion(db, AiTagSuggestionCreate(suggested_text="AI算力", score=8.0, reason="关注度上升"))
        create_ai_tag_suggestion(db, AiTagSuggestionCreate(suggested_text="AI算力", score=7.0, reason="重复推荐"))
        rows = list(db.scalars(select(AiTagSuggestion).where(AiTagSuggestion.suggested_text == "AI算力")))
        assert len(rows) == 2
        assert all(not hasattr(row, "suggested_type") for row in rows)
    finally:
        db.close()


def test_rejected_ai_tag_suggestion_counts_manual_reject_and_restore():
    SessionLocal = make_session("reject-count")
    db = SessionLocal()
    try:
        row = create_ai_tag_suggestion(db, AiTagSuggestionCreate(suggested_text="AI绠楀姏", score=8.0))

        rejected = reject_ai_tag_suggestion(db, row)
        assert rejected.status == "rejected"
        assert rejected.rejected_count == 1

        restored = restore_ai_tag_suggestion(db, rejected)
        assert restored.status == "pending"
        assert restored.rejected_count == 1
    finally:
        db.close()


def test_hotword_generation_skips_all_existing_suggestions_and_counts_rejected(monkeypatch):
    SessionLocal = make_session("generation-duplicates")
    db = SessionLocal()
    try:
        db.add(SourceItem(source_type="news", source_name="manual", title="AI 新闻", content="AI绠楀姏 再次出现"))
        db.add(AiTagSuggestion(suggested_text="AI绠楀姏", score=8.0, status="rejected", rejected_count=2))
        db.add(AiTagSuggestion(suggested_text="机器人", score=7.0, status="pending"))
        db.add(AiTagSuggestion(suggested_text="低空经济", score=6.0, status="approved"))
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(market_radar_jobs, "SessionLocal", SessionLocal)
    monkeypatch.setattr(
        market_radar_jobs,
        "get_active_prompt_by_key",
        lambda db, key: type("Prompt", (), {"model": "deepseek-v4-flash"})(),
    )
    monkeypatch.setattr(market_radar_jobs.deepseek_client, "extract_hotwords", lambda news, prompt, model: {
        "hotwords": [
            {"name": "AI绠楀姏", "score": 9, "reason": "再次命中"},
            {"name": "机器人", "score": 7, "reason": "已待审"},
            {"name": "低空经济", "score": 6, "reason": "已通过"},
            {"name": "商业航天", "score": 8, "reason": "新词"},
        ],
        "usage": {},
    })
    monkeypatch.setattr(market_radar_jobs, "_suggest_hotword_merges", lambda db, candidates, model: {})

    result = market_radar_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-05-26")

    assert result.success
    assert result.inserted_count == 1
    assert result.skipped_count == 3
    db = SessionLocal()
    try:
        rows = list(db.scalars(select(AiTagSuggestion).order_by(AiTagSuggestion.suggested_text.asc())))
        names = [row.suggested_text for row in rows]
        rejected = db.scalar(select(AiTagSuggestion).where(AiTagSuggestion.suggested_text == "AI绠楀姏"))
        assert names.count("商业航天") == 1
        assert names.count("AI绠楀姏") == 1
        assert rejected.rejected_count == 3
    finally:
        db.close()


def test_rejected_count_backfill_script_adds_column_and_is_idempotent():
    TEST_DB_ROOT.mkdir(parents=True, exist_ok=True)
    db_path = TEST_DB_ROOT / f"alter-script-{uuid4()}.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE ai_tag_suggestion (id INTEGER PRIMARY KEY, suggested_text VARCHAR(128) NOT NULL)"))
        conn.execute(text("INSERT INTO ai_tag_suggestion (suggested_text) VALUES ('AI绠楀姏')"))

    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path.as_posix()}"}
    command = [sys.executable, "tools/dev/add_ai_tag_suggestion_rejected_count.py"]
    first = subprocess.run(command, cwd=Path.cwd(), env=env, text=True, capture_output=True, check=True)
    second = subprocess.run(command, cwd=Path.cwd(), env=env, text=True, capture_output=True, check=True)

    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(ai_tag_suggestion)"))}
        value = conn.execute(text("SELECT rejected_count FROM ai_tag_suggestion")).scalar_one()
    assert "rejected_count" in columns
    assert value == 0
    assert "added rejected_count" in first.stdout
    assert "already exists" in second.stdout


def test_ai_tag_suggestion_api_accepts_plain_words():
    SessionLocal = make_session("api")
    client = TestClient(create_app())

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    client.app.dependency_overrides[get_db] = override_get_db
    client.app.dependency_overrides[get_current_user] = lambda: UserAccount(id=1, username="tester", password_hash="x", status="active")
    response = client.post(
        "/api/market-radar/ai-tag-suggestions",
        json={"suggested_text": "商业航天", "score": 8.5, "reason": "多条新闻提及"},
        headers={"Authorization": "Bearer test-token"},
    )
    client.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "suggested_type" not in response.json()
    assert response.json()["rejected_count"] == 0
