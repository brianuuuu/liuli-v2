from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.dispatcher import execute_job
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem
from invest_assistant.modules.basic.stock_master.service import import_stocks
from invest_assistant.modules.market_radar.schemas import SourceItemCreate, TagCreate
from invest_assistant.modules.market_radar.service import aggregate_heat, create_source_item, extract_tags
from invest_assistant.modules.track_discovery.schemas import TrackCreate
from invest_assistant.modules.track_discovery.service import create_track


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def seed_market_radar_track() -> int:
    db = SessionLocal()
    try:
        track = create_track(db, TrackCreate(name="AI算力", description="算力基础设施", status="candidate"))
        create_source_item(
            db,
            SourceItemCreate(
                source_type="news",
                source_name="manual",
                title="AI算力升温",
                content="AI算力 被反复提及。",
                publish_time="2026-05-13T10:00:00",
            ),
        )
        extract_tags(db)
        aggregate_heat(db)
        return track["id"]
    finally:
        db.close()


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


def test_track_crud_children_and_status_history():
    reset_db()
    stock_id = seed_stock()
    client = TestClient(create_app())
    headers = login_headers(client)

    track = client.post(
        "/api/track-discovery/tracks",
        json={"name": "AI算力", "description": "算力基础设施", "status": "candidate"},
        headers=headers,
    )
    assert track.status_code == 200
    track_id = track.json()["id"]
    assert track.json()["tag"]["type"] == "track"
    assert track.json()["tag"]["track_id"] == track_id

    alias = client.post(
        f"/api/track-discovery/tracks/{track_id}/aliases",
        json={"alias": "AI服务器", "source": "manual", "status": "active"},
        headers=headers,
    )
    assert alias.status_code == 200

    thesis = client.post(
        f"/api/track-discovery/tracks/{track_id}/theses",
        json={
            "title": "AI算力长期景气",
            "core_thesis": "算力需求持续增长",
            "underlying_change": "模型规模扩大",
            "old_bottleneck": "供给不足",
            "new_solution": "先进封装与国产替代",
            "value_chain_shift": "上游设备受益",
            "time_horizon": "mid",
            "confidence_level": "medium",
            "status": "watching",
        },
        headers=headers,
    )
    assert thesis.status_code == 200
    thesis_id = thesis.json()["id"]
    assert thesis.json()["track_id"] == track_id

    indicator = client.post(
        f"/api/track-discovery/tracks/{track_id}/indicators",
        json={
            "name": "资本开支",
            "indicator_type": "capex",
            "data_source": "manual",
            "current_value": "增长",
            "direction": "up",
            "validation_meaning": "验证需求",
        },
        headers=headers,
    )
    assert indicator.status_code == 200

    evidence = client.post(
        f"/api/track-discovery/tracks/{track_id}/evidence",
        json={
            "source_item_id": None,
            "evidence_direction": "support",
            "evidence_strength": 0.8,
            "summary": "产业新闻支持",
            "affected_segments": "上游",
            "related_stock_ids": str([stock_id]),
        },
        headers=headers,
    )
    assert evidence.status_code == 200

    related = client.post(
        f"/api/track-discovery/tracks/{track_id}/related-stocks",
        json={
            "stock_id": stock_id,
            "role": "受益标的",
            "relevance_score": 0.7,
            "evidence_count": 1,
            "heat_score": 10,
            "status": "candidate",
        },
        headers=headers,
    )
    assert related.status_code == 200

    status = client.post(
        f"/api/track-discovery/tracks/{track_id}/status",
        json={"new_status": "validated", "reason": "证据增强"},
        headers=headers,
    )
    assert status.status_code == 200
    assert status.json()["status"] == "validated"

    assert client.get("/api/track-discovery/theses", headers=headers).status_code == 404
    assert client.get("/api/track-discovery/candidates", headers=headers).status_code == 404


def test_track_candidates_from_market_radar_heat_and_job():
    reset_db()
    seed_market_radar_track()
    client = TestClient(create_app())
    headers = login_headers(client)

    candidates = client.get("/api/track-discovery/tracks?status=candidate", headers=headers)
    assert candidates.status_code == 200
    assert candidates.json()[0]["name"] == "AI算力"

    db = SessionLocal()
    try:
        result = execute_job(db, "track_discovery.generate_candidates", {})
        assert result.success is True
        assert result.processed_count >= 1
    finally:
        db.close()
