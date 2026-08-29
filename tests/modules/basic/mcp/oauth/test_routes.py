import asyncio
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp.server.fastmcp import FastMCP

from invest_assistant.bootstrap.config import Settings

from .test_provider import (
    CALLBACK_URI,
    ISSUER_URL,
    RESOURCE_URL,
    add_provider_config,
    make_provider,
    params,
)


def oauth_settings(**overrides) -> Settings:
    values = {
        "mcp_oauth_enabled": True,
        "mcp_oauth_issuer_url": ISSUER_URL,
        "mcp_oauth_resource_url": RESOURCE_URL,
    }
    values.update(overrides)
    return Settings(**values)


def create_pending_authorization(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.security import load_or_create_master_key

    key = load_or_create_master_key(tmp_path / "master.key", create=True)
    db = oauth_session_factory()
    add_provider_config(db, key)
    provider = make_provider(oauth_session_factory, key)
    client = asyncio.run(provider.get_client("chatgpt-client"))
    assert client is not None
    login_url = asyncio.run(provider.authorize(client, params()))
    request_id = parse_qs(urlparse(login_url).query)["request_id"][0]
    return provider, request_id


def test_oauth_metadata_describes_fixed_confidential_client_flow():
    from invest_assistant.modules.basic.mcp.oauth.routes import (
        build_authorization_server_metadata,
        build_protected_resource_metadata,
    )

    settings = oauth_settings()
    protected = build_protected_resource_metadata(settings)
    authorization = build_authorization_server_metadata(settings)

    assert protected == {
        "resource": RESOURCE_URL,
        "authorization_servers": [ISSUER_URL],
        "scopes_supported": ["mcp", "offline_access"],
        "bearer_methods_supported": ["header"],
    }
    assert authorization["issuer"] == ISSUER_URL
    assert authorization["authorization_endpoint"] == f"{ISSUER_URL}/authorize"
    assert authorization["token_endpoint"] == f"{ISSUER_URL}/token"
    assert authorization["revocation_endpoint"] == f"{ISSUER_URL}/revoke"
    assert authorization["code_challenge_methods_supported"] == ["S256"]
    assert authorization["token_endpoint_auth_methods_supported"] == [
        "client_secret_basic",
        "client_secret_post",
    ]
    assert "registration_endpoint" not in authorization


def test_metadata_routes_are_hidden_when_oauth_is_disabled(monkeypatch):
    from invest_assistant.modules.basic.mcp.oauth import routes

    monkeypatch.setattr(routes, "get_settings", lambda: oauth_settings(mcp_oauth_enabled=False))
    app = FastAPI()
    app.include_router(routes.oauth_metadata_router)
    client = TestClient(app)

    assert client.get("/.well-known/oauth-protected-resource/mcp").status_code == 404
    assert client.get("/.well-known/oauth-authorization-server/mcp").status_code == 404


def test_authorization_page_shows_safe_context_and_security_headers(
    oauth_session_factory, tmp_path: Path
):
    from invest_assistant.modules.basic.mcp.oauth.routes import register_oauth_ui_routes

    provider, request_id = create_pending_authorization(oauth_session_factory, tmp_path)
    server = FastMCP(name="liuli-oauth-ui", streamable_http_path="/", json_response=True)
    register_oauth_ui_routes(server, provider)
    client = TestClient(server.streamable_http_app())

    response = client.get(f"/oauth/login?request_id={request_id}")

    assert response.status_code == 200
    assert "ChatGPT" in response.text
    assert "chatgpt.com" in response.text
    assert "portfolio.get_overview" in response.text
    assert 'name="csrf_token"' in response.text
    assert f'action="{ISSUER_URL}/oauth/authorize"' in response.text
    assert "chatgpt-secret" not in response.text
    assert "state-value" not in response.text
    assert "a" * 43 not in response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in response.headers["content-security-policy"]


def test_authorization_page_uses_generic_login_error(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.routes import register_oauth_ui_routes

    provider, request_id = create_pending_authorization(oauth_session_factory, tmp_path)
    server = FastMCP(name="liuli-oauth-ui", streamable_http_path="/", json_response=True)
    register_oauth_ui_routes(server, provider)
    client = TestClient(server.streamable_http_app())

    response = client.post(
        "/oauth/authorize",
        data={
            "request_id": request_id,
            "csrf_token": provider.csrf_token_for_request(request_id),
            "username": "missing-user",
            "password": "wrong-password",
            "action": "approve",
        },
        follow_redirects=False,
    )

    assert response.status_code == 401
    assert "用户名或密码错误" in response.text
    assert "missing-user" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_authorization_page_redirects_success_to_exact_callback(
    oauth_session_factory, tmp_path: Path
):
    from invest_assistant.modules.basic.mcp.oauth.routes import register_oauth_ui_routes

    provider, request_id = create_pending_authorization(oauth_session_factory, tmp_path)
    server = FastMCP(name="liuli-oauth-ui", streamable_http_path="/", json_response=True)
    register_oauth_ui_routes(server, provider)
    client = TestClient(server.streamable_http_app())

    response = client.post(
        "/oauth/authorize",
        data={
            "request_id": request_id,
            "csrf_token": provider.csrf_token_for_request(request_id),
            "username": "admin",
            "password": "correct-password",
            "action": "approve",
        },
        follow_redirects=False,
    )

    assert response.status_code == 303
    location = response.headers["location"]
    assert location.startswith(f"{CALLBACK_URI}?")
    query = parse_qs(urlparse(location).query)
    assert query["code"][0]
    assert query["state"] == ["state-value"]
