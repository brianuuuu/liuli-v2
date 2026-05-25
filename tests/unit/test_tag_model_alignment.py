import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

test_db_path = Path(tempfile.gettempdir()) / "liuli_test_tag_model_alignment.sqlite3"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path.as_posix()}"

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem
from invest_assistant.modules.basic.stock_master.service import import_stocks
from invest_assistant.modules.market_radar.models import (
    AiTagSuggestion,
    Hotword,
    HotwordTagRelation,
    SourceTag,
    StockTagRelation,
    Tag,
    TrackTagRelation,
)


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def seed_stock() -> int:
    db = SessionLocal()
    try:
        stock = import_stocks(
            db,
            [StockImportItem(stock_code="300750", stock_name="宁德时代", market="A股", exchange="SZSE")],
        )[0]
        return stock.id
    finally:
        db.close()


def test_stock_pool_creates_same_name_tag_relation():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)

    response = client.post(
        "/api/stock-analysis/pool",
        json={"stock_id": stock_id, "status": "candidate", "source": "manual", "reason": "观察"},
        headers=headers,
    )

    assert response.status_code == 200
    db = SessionLocal()
    try:
        tag = db.query(Tag).filter(Tag.name == "宁德时代").one()
        relation = db.query(StockTagRelation).filter_by(stock_id=stock_id, tag_id=tag.id).one()
        assert tag.type == "stock"
        assert relation.status == "active"
    finally:
        db.close()


def test_track_and_hotword_creation_create_same_name_tag_relations():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)

    track = client.post(
        "/api/track-discovery/tracks",
        json={"name": "AI算力", "description": "算力基础设施", "status": "candidate"},
        headers=headers,
    )
    hotword = client.post(
        "/api/market-radar/hotwords",
        json={"name": "特朗普", "description": "美国政治人物", "status": "active"},
        headers=headers,
    )

    assert track.status_code == 200
    assert hotword.status_code == 200
    db = SessionLocal()
    try:
        track_tag = db.query(Tag).filter(Tag.name == "AI算力").one()
        hotword_tag = db.query(Tag).filter(Tag.name == "特朗普").one()
        hotword_entity = db.query(Hotword).filter(Hotword.name == "特朗普").one()
        db.query(TrackTagRelation).filter_by(track_id=track.json()["id"], tag_id=track_tag.id).one()
        db.query(HotwordTagRelation).filter_by(hotword_id=hotword_entity.id, tag_id=hotword_tag.id).one()
    finally:
        db.close()


def test_source_item_matching_uses_bound_tag_words_without_alias_tables():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/stock-analysis/pool", json={"stock_id": stock_id}, headers=headers)
    tag = client.post(
        f"/api/stock-analysis/stocks/{stock_id}/tags",
        json={"name": "宁王", "source": "manual", "status": "active"},
        headers=headers,
    )
    assert tag.status_code == 200

    source = client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "宁王业绩大超预期",
            "content": "宁王 新能源电池业务继续增长。",
        },
        headers=headers,
    )

    assert source.status_code == 200
    db = SessionLocal()
    try:
        source_tag = db.query(SourceTag).one()
        assert source_tag.trigger_text == "宁王"
    finally:
        db.close()


def test_ai_tag_suggestion_has_no_suggested_type_and_can_bind_hotword():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)

    suggestion = client.post(
        "/api/market-radar/ai-tag-suggestions",
        json={"suggested_text": "神舟22号", "score": 8.5, "reason": "航天新闻集中提及"},
        headers=headers,
    )
    approved = client.post(
        f"/api/market-radar/ai-tag-suggestions/{suggestion.json()['id']}/approve",
        json={"final_tag_name": "神舟", "target_type": "hotword", "target_name": "神舟"},
        headers=headers,
    )

    assert suggestion.status_code == 200
    assert "suggested_type" not in suggestion.json()
    assert approved.status_code == 200
    db = SessionLocal()
    try:
        row = db.query(AiTagSuggestion).one()
        tag = db.query(Tag).filter(Tag.name == "神舟").one()
        hotword = db.query(Hotword).filter(Hotword.name == "神舟").one()
        db.query(HotwordTagRelation).filter_by(hotword_id=hotword.id, tag_id=tag.id).one()
        assert row.final_tag_id == tag.id
        assert row.status == "approved"
    finally:
        db.close()
