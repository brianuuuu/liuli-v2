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
