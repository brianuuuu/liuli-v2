import base64
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from invest_assistant.bootstrap.config import Settings

from .test_provider import CALLBACK_URI, add_provider_config

PUBLIC_ORIGIN = "https://example.com"
MCP_URL = f"{PUBLIC_ORIGIN}/mcp"


def integration_settings(key_path: Path, *, oauth_enabled: bool) -> Settings:
    return Settings(
        mcp_public_base_url=PUBLIC_ORIGIN,
        mcp_oauth_enabled=oauth_enabled,
        mcp_oauth_issuer_url=MCP_URL,
        mcp_oauth_resource_url=MCP_URL,
        mcp_oauth_master_key_file=str(key_path),
        mcp_oauth_access_token_minutes=15,
        mcp_oauth_refresh_token_days=30,
    )


def test_mcp_server_switches_between_legacy_and_oauth_modes(
    oauth_session_factory, tmp_path: Path, monkeypatch
):
    from invest_assistant.modules.basic.mcp import server as mcp_server
    from invest_assistant.modules.basic.mcp.oauth.security import load_or_create_master_key

    key_path = tmp_path / "master.key"
    key = load_or_create_master_key(key_path, create=True)
    db = oauth_session_factory()
    add_provider_config(db, key)

    monkeypatch.setattr(mcp_server, "get_settings", lambda: integration_settings(key_path, oauth_enabled=False))
    legacy = mcp_server.create_liuli_mcp_server(session_factory=oauth_session_factory)
    assert legacy._auth_server_provider is None
    assert legacy._token_verifier is not None

    monkeypatch.setattr(mcp_server, "get_settings", lambda: integration_settings(key_path, oauth_enabled=True))
    oauth = mcp_server.create_liuli_mcp_server(session_factory=oauth_session_factory)
    assert oauth._auth_server_provider is not None
    assert oauth._token_verifier is not None
    assert "example.com" in oauth.settings.transport_security.allowed_hosts


def test_oauth_startup_requires_an_enabled_client_profile(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.provider import build_oauth_provider
    from invest_assistant.modules.basic.mcp.oauth.security import (
        OAuthConfigurationError,
        load_or_create_master_key,
    )

    key_path = tmp_path / "master.key"
    load_or_create_master_key(key_path, create=True)

    with pytest.raises(OAuthConfigurationError, match="enabled OAuth client"):
        build_oauth_provider(
            integration_settings(key_path, oauth_enabled=True),
            session_factory=oauth_session_factory,
        )


def test_full_oauth_pkce_and_legacy_bearer_initialize_flow(
    oauth_session_factory, tmp_path: Path, monkeypatch
):
    from invest_assistant.modules.basic.mcp import server as mcp_server
    from invest_assistant.modules.basic.mcp.oauth import routes
    from invest_assistant.modules.basic.mcp.oauth.security import (
        load_or_create_master_key,
        pkce_s256_challenge,
    )

    key_path = tmp_path / "master.key"
    key = load_or_create_master_key(key_path, create=True)
    db = oauth_session_factory()
    add_provider_config(db, key)
    settings = integration_settings(key_path, oauth_enabled=True)
    monkeypatch.setattr(mcp_server, "get_settings", lambda: settings)
    monkeypatch.setattr(routes, "get_settings", lambda: settings)
    mcp = mcp_server.create_liuli_mcp_server(session_factory=oauth_session_factory)
    mcp_app = mcp.streamable_http_app()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with mcp_app.router.lifespan_context(mcp_app):
            yield

    app = FastAPI(lifespan=lifespan)
    app.include_router(routes.oauth_metadata_router)
    app.mount("/mcp", mcp_app)

    verifier = "v" * 64
    authorize_query = urlencode(
        {
            "response_type": "code",
            "client_id": "chatgpt-client",
            "redirect_uri": CALLBACK_URI,
            "scope": "mcp offline_access",
            "state": "integration-state",
            "code_challenge": pkce_s256_challenge(verifier),
            "code_challenge_method": "S256",
            "resource": MCP_URL,
        }
    )
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "oauth-integration-test", "version": "1.0"},
        },
    }

    with TestClient(app, base_url=PUBLIC_ORIGIN) as client:
        protected = client.get("/.well-known/oauth-protected-resource/mcp")
        assert protected.status_code == 200
        assert protected.json()["authorization_servers"] == [MCP_URL]

        unauthorized = client.post(
            "/mcp/",
            json=initialize,
            headers={"Accept": "application/json, text/event-stream"},
        )
        assert unauthorized.status_code == 401
        assert f'{PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp' in unauthorized.headers[
            "www-authenticate"
        ]

        authorize = client.get(f"/mcp/authorize?{authorize_query}", follow_redirects=False)
        assert authorize.status_code in {302, 307}
        login = client.get(authorize.headers["location"])
        assert login.status_code == 200
        request_id = re.search(r'name="request_id" value="([^"]+)"', login.text).group(1)
        csrf_token = re.search(r'name="csrf_token" value="([^"]+)"', login.text).group(1)

        approved = client.post(
            "/mcp/oauth/authorize",
            data={
                "request_id": request_id,
                "csrf_token": csrf_token,
                "username": "admin",
                "password": "correct-password",
                "action": "approve",
            },
            follow_redirects=False,
        )
        assert approved.status_code == 303
        callback_query = parse_qs(urlparse(approved.headers["location"]).query)
        assert callback_query["state"] == ["integration-state"]
        code = callback_query["code"][0]

        basic = base64.b64encode(b"chatgpt-client:chatgpt-secret").decode("ascii")
        exchanged = client.post(
            "/mcp/token",
            headers={"Authorization": f"Basic {basic}"},
            data={
                "grant_type": "authorization_code",
                "client_id": "chatgpt-client",
                "code": code,
                "redirect_uri": CALLBACK_URI,
                "code_verifier": verifier,
                "resource": MCP_URL,
            },
        )
        assert exchanged.status_code == 200, exchanged.text
        token = exchanged.json()
        assert token["refresh_token"]

        oauth_initialize = client.post(
            "/mcp/",
            json=initialize,
            headers={
                "Authorization": f"Bearer {token['access_token']}",
                "Accept": "application/json, text/event-stream",
            },
        )
        assert oauth_initialize.status_code == 200, oauth_initialize.text
        assert oauth_initialize.json()["result"]["serverInfo"]["name"] == "liuli"

        legacy_initialize = client.post(
            "/mcp/",
            json=initialize,
            headers={
                "Authorization": "Bearer legacy-token",
                "Accept": "application/json, text/event-stream",
            },
        )
        assert legacy_initialize.status_code == 200, legacy_initialize.text
        assert legacy_initialize.json()["result"]["serverInfo"]["name"] == "liuli"
