import os
import sys
import tempfile
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

test_db_path = Path(tempfile.gettempdir()) / "liuli_test_job_center.sqlite3"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path.as_posix()}"

from fastapi.testclient import TestClient
import pandas as pd

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunLog, JobRunRequest
from invest_assistant.modules.basic.job_center.service import sync_job_definitions
from invest_assistant.modules.basic.job_center.scheduler import build_job_scheduler
from invest_assistant.modules.basic.job_center.worker import recover_stale_running_requests, run_once, sync_scheduled_jobs
from invest_assistant.shared.time_utils import utc_now


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


def test_worker_consumes_pending_manual_run_request(monkeypatch):
    reset_db()
    monkeypatch.setitem(
        sys.modules,
        "akshare",
        SimpleNamespace(stock_info_a_code_name=lambda: pd.DataFrame([{"code": "000001", "name": "平安银行"}])),
    )
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post("/api/jobs/sync-definitions", headers=headers)
    response = client.post("/api/jobs/stock_master.sync_stock_basic/run", json={"params": {}}, headers=headers)

    assert response.status_code == 200
    assert run_once() is True

    db = SessionLocal()
    try:
        request = db.get(JobRunRequest, response.json()["id"])
        logs = db.query(JobRunLog).filter(JobRunLog.job_name == "stock_master.sync_stock_basic").all()
        assert request is not None
        assert request.status == "success"
        assert request.started_at is not None
        assert request.finished_at is not None
        assert len(logs) == 1
        assert logs[0].trigger_type == "manual"
    finally:
        db.close()


def test_worker_recovers_stale_running_request():
    reset_db()
    db = SessionLocal()
    try:
        sync_job_definitions(db)
        config = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_news").one()
        config.config_json = {**config.config_json, "timeout_seconds": 1}
        request = JobRunRequest(
            job_name="market_radar.fetch_news",
            params_json="{}",
            status="running",
            started_at=utc_now() - timedelta(seconds=10),
        )
        db.add(request)
        db.commit()

        assert recover_stale_running_requests(db) == 1
        db.refresh(request)
        assert request.status == "failed"
        assert request.finished_at is not None
        assert request.error_message == "worker interrupted or timed out after 1 seconds"
    finally:
        db.close()


def test_worker_registers_and_removes_enabled_schedule_jobs():
    reset_db()
    db = SessionLocal()
    scheduler = build_job_scheduler()
    try:
        sync_job_definitions(db)
        config = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_news").one()
        config.config_json = {
            "enabled": True,
            "execution_mode": "schedule",
            "schedule_kind": "interval",
            "run_time": "08:00",
            "cron_expr": "*/5 * * * *",
            "allow_manual_run": True,
            "timeout_seconds": 120,
            "max_retries": 1,
        }
        db.commit()

        sync_scheduled_jobs(scheduler, db)
        scheduled = scheduler.get_job("job-center:market_radar.fetch_news")
        assert scheduled is not None
        assert scheduled.name == "*/5 * * * *"

        config.config_json = {**config.config_json, "enabled": False}
        db.commit()
        sync_scheduled_jobs(scheduler, db)
        assert scheduler.get_job("job-center:market_radar.fetch_news") is None
    finally:
        db.close()


def test_worker_replaces_schedule_job_when_cron_changes():
    reset_db()
    db = SessionLocal()
    scheduler = build_job_scheduler()
    try:
        sync_job_definitions(db)
        config = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_news").one()
        config.config_json = {
            "enabled": True,
            "execution_mode": "schedule",
            "schedule_kind": "interval",
            "run_time": "08:00",
            "cron_expr": "*/5 * * * *",
            "allow_manual_run": True,
            "timeout_seconds": 120,
            "max_retries": 1,
        }
        db.commit()
        sync_scheduled_jobs(scheduler, db)

        config.config_json = {**config.config_json, "cron_expr": "*/10 * * * *"}
        db.commit()
        sync_scheduled_jobs(scheduler, db)

        scheduled = scheduler.get_job("job-center:market_radar.fetch_news")
        assert scheduled is not None
        assert scheduled.name == "*/10 * * * *"
    finally:
        db.close()


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
