from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parents[2]


def test_project_is_named_liuli():
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert data["project"]["name"] == "liuli"


def test_runtime_directories_are_ignored_but_present():
    assert (ROOT / "var").exists()
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "var/*" in gitignore
    assert "!var/.gitkeep" in gitignore


from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.config import get_settings


def test_app_health_endpoint_returns_ok():
    client = TestClient(create_app())
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_settings_default_database_url_points_to_var_db():
    settings = get_settings()
    assert settings.database_url.endswith("var/db/liuli.sqlite3")
