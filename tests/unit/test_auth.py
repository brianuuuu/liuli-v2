from collections.abc import Generator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base, get_db
from invest_assistant.modules.basic.auth.router import router as auth_router


def create_auth_client(tmp_path) -> TestClient:
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'auth.sqlite3').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(auth_router)
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def login_headers(client: TestClient, password: str = "admin123") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": "admin", "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_login_returns_token_for_default_user(tmp_path):
    client = create_auth_client(tmp_path)
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


def test_me_requires_bearer_token(tmp_path):
    client = create_auth_client(tmp_path)
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_change_password_requires_bearer_token(tmp_path):
    client = create_auth_client(tmp_path)
    response = client.post(
        "/api/auth/change-password",
        json={"old_password": "admin123", "new_password": "admin456"},
    )
    assert response.status_code == 401


def test_change_password_rejects_wrong_old_password_and_keeps_existing_password(tmp_path):
    client = create_auth_client(tmp_path)
    headers = login_headers(client)

    response = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"old_password": "wrong-password", "new_password": "admin456"},
    )

    assert response.status_code == 400
    assert client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).status_code == 200
    assert client.post("/api/auth/login", json={"username": "admin", "password": "admin456"}).status_code == 401


def test_change_password_updates_password_for_next_login(tmp_path):
    client = create_auth_client(tmp_path)
    headers = login_headers(client)

    response = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"old_password": "admin123", "new_password": "admin456"},
    )

    assert response.status_code == 200
    assert response.json() == {"success": True}
    assert client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "admin", "password": "admin456"}).status_code == 200
