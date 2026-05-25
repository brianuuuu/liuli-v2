from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base, get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.market_radar.models import TagCandidate
from invest_assistant.modules.market_radar.router import router
from invest_assistant.modules.market_radar.schemas import TagCandidateCreate
from invest_assistant.modules.market_radar.service import create_candidate

TEST_DB_ROOT = Path("var/cache/test-tag-candidates")


def make_session(name: str):
    TEST_DB_ROOT.mkdir(parents=True, exist_ok=True)
    db_path = TEST_DB_ROOT / f"{name}-{uuid4()}.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def test_create_candidate_rejects_duplicate_name_even_when_existing_is_rejected():
    SessionLocal = make_session("service-duplicate")
    db = SessionLocal()
    try:
        create_candidate(
            db,
            TagCandidateCreate(
                name="AI算力",
                suggested_type="hotword",
                trigger_text="AI算力",
                status="rejected",
            ),
        )

        try:
            create_candidate(
                db,
                TagCandidateCreate(
                    name="AI算力",
                    suggested_type="track",
                    trigger_text="AI算力",
                    status="pending",
                ),
            )
        except ValueError as exc:
            assert "candidate name already exists" in str(exc)
        else:
            raise AssertionError("expected duplicate candidate name to be rejected")

        rows = list(db.scalars(select(TagCandidate).where(TagCandidate.name == "AI算力")))
        assert len(rows) == 1
        assert rows[0].status == "rejected"
    finally:
        db.close()


def test_create_candidate_api_returns_400_for_duplicate_name():
    from fastapi.testclient import TestClient

    SessionLocal = make_session("api-duplicate")
    app = FastAPI()
    app.include_router(router)

    def override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: object()
    client = TestClient(app)

    first = client.post(
        "/api/market-radar/tag-candidates",
        json={"name": "AI算力", "suggested_type": "hotword", "trigger_text": "AI算力", "status": "rejected"},
    )
    duplicate = client.post(
        "/api/market-radar/tag-candidates",
        json={"name": "AI算力", "suggested_type": "track", "trigger_text": "AI算力", "status": "pending"},
    )

    assert first.status_code == 200
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "candidate name already exists"
