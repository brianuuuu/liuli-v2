from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, engine


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_stock_import_and_search():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    response = client.post(
        "/api/stocks/import",
        json=[{"stock_code": "000001", "stock_name": "平安银行", "market": "A股", "exchange": "SZSE"}],
        headers=headers,
    )
    assert response.status_code == 200
    search = client.get("/api/stocks/search?keyword=平安", headers=headers)
    assert search.status_code == 200
    assert search.json()[0]["stock_name"] == "平安银行"


def test_system_config_crud():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    create = client.post(
        "/api/system-config",
        json={
            "config_key": "market_radar.heat_window",
            "config_value": "24h",
            "config_type": "string",
            "module_name": "market_radar",
            "description": "Market radar default heat window",
            "enabled": True,
        },
        headers=headers,
    )
    assert create.status_code == 200
    update = client.put(
        "/api/system-config/market_radar.heat_window",
        json={"config_value": "7d", "enabled": True},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["config_value"] == "7d"
