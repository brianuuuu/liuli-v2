from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.dispatcher import execute_job
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem
from invest_assistant.modules.basic.stock_master.service import import_stocks


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


def test_market_radar_tag_crud_and_source_item_flow():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)

    stock_tag = client.post(
        "/api/market-radar/tags",
        json={"name": "平安银行", "type": "stock", "category": "bank", "stock_id": stock_id, "status": "active"},
        headers=headers,
    )
    assert stock_tag.status_code == 200
    assert stock_tag.json()["type"] == "stock"

    source = client.post(
        "/api/market-radar/source-items",
        json={
            "source_type": "news",
            "source_name": "manual",
            "title": "AI算力带动平安银行科技金融关注",
            "content": "AI算力 与 平安银行 同时被市场提及，降息预期升温。",
            "source_url": "https://example.com/news/1",
            "publish_time": "2026-05-13T09:00:00",
        },
        headers=headers,
    )
    assert source.status_code == 200
    assert source.json()["title"].startswith("AI算力")


def test_rule_extraction_heat_and_graph_jobs():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)
    for tag in [
        {"name": "平安银行", "type": "stock", "category": "bank", "stock_id": stock_id, "status": "active"},
        {"name": "AI算力", "type": "track", "category": "technology", "stock_id": None, "status": "active"},
        {"name": "降息", "type": "hotword", "category": "macro", "stock_id": None, "status": "active"},
    ]:
        assert client.post("/api/market-radar/tags", json=tag, headers=headers).status_code == 200
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
            "category": "technology",
            "source_item_id": source["id"],
            "confidence": 0.8,
            "reason": "manual test",
            "status": "pending",
        },
        headers=headers,
    ).json()

    approved = client.post(f"/api/market-radar/tag-candidates/{candidate['id']}/approve", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    tags = client.get("/api/market-radar/tags", headers=headers)
    assert any(item["name"] == "机器人" for item in tags.json())
