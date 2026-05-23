from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.dispatcher import execute_job
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem
from invest_assistant.modules.basic.stock_master.service import import_stocks
from invest_assistant.modules.market_radar.models import Tag
from invest_assistant.modules.market_radar import jobs as market_radar_jobs


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


def test_market_radar_source_item_and_hotword_flow():
    reset_db()
    seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)

    source = client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "AI算力带动平安银行科技金融关注",
            "content": "AI算力 与 平安银行 同时被市场提及，降息预期升温。",
            "source_url": "https://example.com/news/1",
            "publish_time": "2026-05-13T09:00:00",
            "related_type": "manual",
            "related_id": None,
        },
        headers=headers,
    )
    assert source.status_code == 200
    assert source.json()["title"].startswith("AI算力")
    assert source.json()["related_type"] == "manual"

    stock_tags = client.get("/api/market-radar/tags?type=stock", headers=headers)
    assert stock_tags.status_code == 200
    assert stock_tags.json() == []

    candidate = client.post(
        "/api/market-radar/tag-candidates",
        json={
            "name": "降息",
            "suggested_type": "hotword",
            "source_item_id": source.json()["id"],
            "trigger_text": "降息",
            "confidence": 0.9,
            "reason": "manual test",
            "status": "pending",
        },
        headers=headers,
    ).json()
    approved = client.post(f"/api/market-radar/tag-candidates/{candidate['id']}/approve", headers=headers)
    assert approved.status_code == 200
    hotword_tags = client.get("/api/market-radar/tags?type=hotword", headers=headers)
    assert any(item["name"] == "降息" for item in hotword_tags.json())


def test_rule_extraction_heat_and_graph_jobs():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)
    assert client.post("/api/stock-analysis/pool", json={"stock_id": stock_id, "status": "watching"}, headers=headers).status_code == 200
    track = client.post(
        "/api/track-discovery/tracks",
        json={"name": "AI算力", "description": "算力基础设施", "status": "active"},
        headers=headers,
    )
    assert track.status_code == 200
    source_for_candidate = client.post(
        "/api/market-radar/source-items",
        json={"source_type": "news", "source_name": "manual", "title": "候选词", "content": "降息", "publish_time": "2026-05-13T09:00:00"},
        headers=headers,
    ).json()
    candidate = client.post(
        "/api/market-radar/tag-candidates",
        json={"name": "降息", "suggested_type": "hotword", "source_item_id": source_for_candidate["id"], "trigger_text": "降息", "confidence": 0.8},
        headers=headers,
    ).json()
    assert client.post(f"/api/market-radar/tag-candidates/{candidate['id']}/approve", headers=headers).status_code == 200
    assert (
        client.post(
            "/api/market-radar/source-items",
            json={
                "source_type": "news",
                "source_name": "manual",
                "title": "平安银行与AI算力",
                "content": "平安银行 被 AI算力 和 降息 同时提及。",
            "source_url": "https://example.com/news/2",
            "publish_time": "2026-05-13T10:00:00",
        },
            headers=headers,
        ).status_code
        == 200
    )

    db = SessionLocal()
    try:
        assert execute_job(db, "market_radar.extract_tags").success is True
        assert execute_job(db, "market_radar.aggregate_heat").success is True
        assert execute_job(db, "market_radar.aggregate_edges").success is True
    finally:
        db.close()

    rankings = client.get("/api/market-radar/rankings?type=track&window=24h", headers=headers)
    assert rankings.status_code == 200
    assert rankings.json()[0]["tag"]["name"] == "AI算力"

    graph = client.get("/api/market-radar/graphs/stock-track?window=24h", headers=headers)
    assert graph.status_code == 200
    assert graph.json()["edges"][0]["related_tag"]["name"] == "AI算力"


def test_cls_market_flash_job_inserts_only_new_source_items(monkeypatch):
    reset_db()
    rows = [
        {"标题": "AI算力快讯", "内容": "财联社电，AI算力产业链升温。", "发布日期": "2026-05-17", "发布时间": "09:30:00"},
        {"标题": "低空经济快讯", "内容": "财联社电，低空经济政策持续推进。", "发布日期": "2026-05-17", "发布时间": "09:35:00"},
    ]
    monkeypatch.setattr(market_radar_jobs, "_fetch_cls_rows", lambda limit: rows[:limit])
    client = TestClient(create_app())
    headers = login_headers(client)

    db = SessionLocal()
    try:
        first = execute_job(db, "market_radar.fetch_news", params={"limit": 2})
        second = execute_job(db, "market_radar.fetch_news", params={"limit": 2})
    finally:
        db.close()

    assert first.success is True
    assert first.fetched_count == 2
    assert first.inserted_count == 2
    assert second.success is True
    assert second.fetched_count == 2
    assert second.inserted_count == 0
    assert second.skipped_count == 2

    sources = client.get("/api/market-radar/source-items", headers=headers)
    assert sources.status_code == 200
    assert len(sources.json()) == 2
    assert sources.json()[0]["source_name"] == "财联社"
    assert sources.json()[0]["source_type"] == "news"


def test_cls_market_flash_sync_endpoint_returns_insert_stats(monkeypatch):
    reset_db()
    rows = [
        {"标题": "机器人快讯", "内容": "财联社电，机器人产业链出现新进展。", "发布日期": "2026-05-17", "发布时间": "10:30:00"},
    ]
    monkeypatch.setattr(market_radar_jobs, "_fetch_cls_rows", lambda limit: rows[:limit])
    client = TestClient(create_app())
    headers = login_headers(client)

    first = client.post("/api/market-radar/source-items/sync-cls", json={"limit": 100}, headers=headers)
    second = client.post("/api/market-radar/source-items/sync-cls", json={"limit": 100}, headers=headers)

    assert first.status_code == 200
    assert first.json()["success"] is True
    assert first.json()["inserted_count"] == 1
    assert second.status_code == 200
    assert second.json()["success"] is True
    assert second.json()["inserted_count"] == 0
    assert second.json()["skipped_count"] == 1

    sources = client.get("/api/market-radar/source-items", headers=headers)
    assert len(sources.json()) == 1
    assert sources.json()[0]["title"] == "机器人快讯"


def test_tag_candidate_approve_reject_and_merge():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    source = client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "新热点",
            "content": "新的市场词语出现",
            "source_url": None,
            "publish_time": "2026-05-13T11:00:00",
        },
        headers=headers,
    ).json()
    candidate = client.post(
        "/api/market-radar/tag-candidates",
        json={
            "name": "机器人",
            "suggested_type": "track",
            "source_item_id": source["id"],
            "trigger_text": "机器人",
            "confidence": 0.8,
            "reason": "manual test",
            "status": "pending",
        },
        headers=headers,
    ).json()

    approved = client.post(f"/api/market-radar/tag-candidates/{candidate['id']}/approve", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    tags = client.get("/api/market-radar/tags?type=track", headers=headers)
    assert any(item["name"] == "机器人" for item in tags.json())


def test_direct_hotword_creation_creates_tag_and_aliases():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)

    response = client.post(
        "/api/market-radar/hotwords",
        json={"name": "普通市场词", "aliases": ["市场词", "普通词"], "status": "active"},
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["tag"]["name"] == "普通市场词"
    assert payload["tag"]["type"] == "hotword"
    assert payload["tag"]["status"] == "active"
    assert {item["alias"] for item in payload["aliases"]} == {"市场词", "普通词"}
    db = SessionLocal()
    try:
        assert db.query(Tag).filter(Tag.type == "hotword").count() == 1
    finally:
        db.close()
