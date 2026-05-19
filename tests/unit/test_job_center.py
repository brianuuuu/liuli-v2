from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.service import sync_job_definitions


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_sync_definitions_creates_job_configs():
    reset_db()
    db = SessionLocal()
    try:
        count = sync_job_definitions(db)
        assert count >= 1
    finally:
        db.close()


def test_manual_run_writes_pending_request():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/jobs/sync-definitions", headers=headers)
    response = client.post("/api/jobs/stock_master.sync_stock_basic/run", json={"params": {}}, headers=headers)
    assert response.status_code == 200
    assert response.json()["job_name"] == "stock_master.sync_stock_basic"
    assert response.json()["status"] == "pending"


def test_list_jobs_exposes_params_schema_for_friendly_web_forms():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/jobs/sync-definitions", headers=headers)

    response = client.get("/api/jobs", headers=headers)

    assert response.status_code == 200
    assert response.json()
    assert "params_schema" in response.json()[0]


def test_update_job_schedule_config_without_definition_fields():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/jobs/sync-definitions", headers=headers)

    response = client.put(
        "/api/jobs/market_radar.fetch_news",
        json={
            "config_json": {
                "enabled": True,
                "execution_mode": "schedule",
                "schedule_kind": "daily",
                "run_time": "08:30",
                "cron_expr": "30 8 * * *",
                "allow_manual_run": True,
                "timeout_seconds": 120,
                "max_retries": 1,
            }
        },
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["config_json"]["enabled"] is True
    assert data["config_json"]["execution_mode"] == "schedule"
    assert data["config_json"]["cron_expr"] == "30 8 * * *"
    assert data["config_json"]["timeout_seconds"] == 120
    assert data["config_json"]["max_retries"] == 1
    assert "enabled" not in data
    assert "trigger_type" not in data
    assert "cron_expr" not in data
    assert "timeout_seconds" not in data
    assert "max_retries" not in data


def test_sync_definitions_keeps_user_runtime_config():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/jobs/sync-definitions", headers=headers)
    client.put(
        "/api/jobs/market_radar.fetch_news",
        json={
            "config_json": {
                "enabled": False,
                "execution_mode": "manual",
                "schedule_kind": "daily",
                "run_time": "08:00",
                "cron_expr": None,
                "allow_manual_run": True,
                "timeout_seconds": 99,
                "max_retries": 3,
            }
        },
        headers=headers,
    )

    sync_response = client.post("/api/jobs/sync-definitions", headers=headers)
    response = client.get("/api/jobs/market_radar.fetch_news", headers=headers)

    assert sync_response.status_code == 200
    assert response.status_code == 200
    data = response.json()
    assert data["config_json"]["enabled"] is False
    assert data["config_json"]["execution_mode"] == "manual"
    assert data["config_json"]["cron_expr"] is None
    assert data["config_json"]["timeout_seconds"] == 99
    assert data["config_json"]["max_retries"] == 3


def test_job_config_json_is_source_for_configuration_form():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/jobs/sync-definitions", headers=headers)

    payload = {
        "config_json": {
            "enabled": False,
            "execution_mode": "manual",
            "schedule_kind": "daily",
            "run_time": "08:00",
            "cron_expr": None,
            "allow_manual_run": True,
            "timeout_seconds": 77,
            "max_retries": 2,
        }
    }
    update_response = client.put("/api/jobs/market_radar.fetch_news", json=payload, headers=headers)
    client.post("/api/jobs/sync-definitions", headers=headers)
    get_response = client.get("/api/jobs/market_radar.fetch_news", headers=headers)

    assert update_response.status_code == 200
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["config_json"] == payload["config_json"]
    assert data["ext_json"] == {}
