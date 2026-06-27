from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine, get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem
from invest_assistant.modules.basic.stock_master.service import import_stocks
from invest_assistant.modules.market_radar import service as market_radar_service
from invest_assistant.modules.market_radar import jobs as market_radar_jobs
from invest_assistant.modules.market_radar.models import AiTagSuggestion, Hotword, HotwordTagRelation, SourceItem, SourceTag, Tag, TagHeatSnapshot
from invest_assistant.modules.market_radar.router import router as market_radar_router
from invest_assistant.modules.track_discovery.schemas import TrackCreate
from invest_assistant.modules.track_discovery.service import create_track


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
            [StockImportItem(stock_code="000001", stock_name="平安银行", market="A股", exchange="SZSE")],
        )[0]
        return stock.id
    finally:
        db.close()


def test_tag_trend_endpoint_serializes_heat_snapshots(monkeypatch):
    app = FastAPI()
    app.include_router(market_radar_router)
    app.dependency_overrides[get_current_user] = lambda: object()
    app.dependency_overrides[get_db] = lambda: object()
    snapshot = TagHeatSnapshot(
        id=10912,
        tag_id=4,
        window_type="24h",
        stat_time=datetime(2026, 6, 5, 21, 18, 48),
        trigger_count=6,
        source_count=3,
        heat_score=63.0,
        avg_count=6.0,
        rank_no=1,
        created_at=datetime(2026, 6, 5, 21, 18, 49),
    )
    monkeypatch.setattr(market_radar_service, "tag_trend", lambda db, tag_id: [snapshot])

    response = TestClient(app, raise_server_exceptions=False).get("/api/market-radar/tags/4/trend")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 10912,
            "tag_id": 4,
            "window_type": "24h",
            "stat_time": "2026-06-05T21:18:48",
            "trigger_count": 6,
            "source_count": 3,
            "heat_score": 63.0,
            "avg_count": 6.0,
            "rank_no": 1,
            "created_at": "2026-06-05T21:18:49",
            "tag": None,
        }
    ]


def test_market_radar_source_item_hotword_and_ai_suggestion_flow():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/stock-analysis/pool", json={"stock_id": stock_id}, headers=headers)

    hotword = client.post(
        "/api/market-radar/hotwords",
        json={"name": "降息", "description": "货币政策热词", "status": "active"},
        headers=headers,
    )
    assert hotword.status_code == 200
    assert hotword.json()["tags"][0]["tag"]["name"] == "降息"

    source = client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "平安银行受益于降息预期",
            "content": "平安银行 与 降息 同时被市场提及。",
            "publish_time": "2026-05-13T09:00:00",
        },
        headers=headers,
    )
    assert source.status_code == 200
    assert {item["tag"]["name"] for item in source.json()["source_tags"]} == {"平安银行", "降息"}

    suggestion = client.post(
        "/api/market-radar/ai-tag-suggestions",
        json={"suggested_text": "AI服务器", "score": 8.0, "reason": "新闻集中提及"},
        headers=headers,
    )
    approved = client.post(
        f"/api/market-radar/ai-tag-suggestions/{suggestion.json()['id']}/approve",
        json={"final_tag_name": "AI算力", "target_type": "track", "target_name": "AI算力"},
        headers=headers,
    )
    assert suggestion.status_code == 200
    assert "suggested_type" not in suggestion.json()
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"


def test_rule_extraction_heat_and_graph_jobs_use_tag_words():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/stock-analysis/pool", json={"stock_id": stock_id}, headers=headers)
    db = SessionLocal()
    try:
        create_track(db, TrackCreate(name="AI算力", description="算力基础设施", status="candidate"))
    finally:
        db.close()

    client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "平安银行布局AI算力",
            "content": "平安银行 和 AI算力 被共同提及。",
            "publish_time": "2026-05-13T10:00:00",
        },
        headers=headers,
    )
    client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "平安银行AI算力订单跟进",
            "content": "平安银行 与 AI算力 再次被共同提及。",
            "publish_time": "2026-05-13T10:10:00",
        },
        headers=headers,
    )

    heat = client.get("/api/market-radar/rankings?type=stock&window=24h", headers=headers)
    assert heat.status_code == 200
    assert heat.json() == []

    db = SessionLocal()
    try:
        market_radar_jobs.aggregate_heat_job()
        market_radar_jobs.aggregate_edges_job()
    finally:
        db.close()

    heat = client.get("/api/market-radar/rankings?type=stock&window=24h", headers=headers)
    graph = client.get("/api/market-radar/graphs/stock-track?window=24h", headers=headers)
    assert any(item["tag"]["name"] == "平安银行" for item in heat.json())
    assert graph.json()["edges"][0]["stock_tag"]["name"] == "平安银行"
    assert graph.json()["edges"][0]["related_tag"]["name"] == "AI算力"


def test_deepseek_daily_hotword_job_writes_ai_tag_suggestions(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        db.add(
            SourceItem(
                source_type="news",
                source_name="manual",
                title="商业航天升温",
                content="商业航天 新闻集中出现",
                publish_time=datetime(2026, 5, 25, 9, 0),
            )
        )
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(
        "invest_assistant.modules.market_radar.jobs.get_active_prompt_by_key",
        lambda db, key: type("Prompt", (), {"model": "deepseek-v4-flash"})(),
    )
    monkeypatch.setattr(
        "invest_assistant.services.deepseek.client.extract_hotwords",
        lambda news, prompt, model: {"hotwords": [{"name": "商业航天", "score": 8, "reason": "关注度上升"}], "usage": {}},
    )
    result = market_radar_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-05-25")

    assert result.success
    db = SessionLocal()
    try:
        row = db.query(AiTagSuggestion).one()
        assert row.suggested_text == "商业航天"
        assert row.status == "pending"
        assert db.query(Hotword).count() == 0
        assert db.query(HotwordTagRelation).count() == 0
        assert db.query(Tag).filter(Tag.name == "商业航天").count() == 0
    finally:
        db.close()


def test_track_hotword_graph_endpoint(monkeypatch):
    app = FastAPI()
    app.include_router(market_radar_router)
    app.dependency_overrides[get_current_user] = lambda: object()
    app.dependency_overrides[get_db] = lambda: object()

    mock_data = {
        "nodes": [{"id": 1, "name": "AI算力", "type": "track", "status": "active"}],
        "edges": [],
    }
    monkeypatch.setattr(market_radar_service, "graph_edges", lambda db, related_type, window: mock_data)

    response = TestClient(app, raise_server_exceptions=False).get("/api/market-radar/graphs/track-hotword?window=24h")
    assert response.status_code == 200
    assert response.json() == mock_data
