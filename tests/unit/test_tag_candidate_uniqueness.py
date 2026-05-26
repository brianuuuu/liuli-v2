from uuid import uuid4
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.market_radar.models import AiTagSuggestion
from invest_assistant.modules.market_radar.schemas import AiTagSuggestionCreate
from invest_assistant.modules.market_radar.service import create_ai_tag_suggestion

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
