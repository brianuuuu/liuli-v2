from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, engine


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_login_returns_token_for_default_user():
    reset_db()
    client = TestClient(create_app())
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


def test_me_requires_bearer_token():
    reset_db()
    client = TestClient(create_app())
    response = client.get("/api/auth/me")
    assert response.status_code == 401
