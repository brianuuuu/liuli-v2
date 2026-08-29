import asyncio
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from mcp.server.auth.provider import AuthorizationParams

from invest_assistant.shared.time_utils import utc_now

ISSUER_URL = "https://example.com/mcp"
RESOURCE_URL = "https://example.com/mcp"
CALLBACK_URI = "https://chatgpt.com/connector/oauth/callback"


def add_provider_config(db, key: bytes, *, enabled: bool = True, auth_method: str = "client_secret_basic"):
    from invest_assistant.modules.basic.auth.models import UserAccount
    from invest_assistant.modules.basic.auth.security import hash_password
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthClient
    from invest_assistant.modules.basic.mcp.oauth.security import encrypt_client_secret
    from invest_assistant.modules.basic.system_config.models import SystemConfig

    db.add(
        SystemConfig(
            config_key="mcp.clients",
            config_value=json.dumps(
                {
                    "codex": {
                        "enabled": True,
                        "token": "legacy-token",
                        "allowed_tools": ["portfolio.get_overview"],
                    },
                    "chatgpt": {
                        "enabled": True,
                        "auth_modes": ["oauth"],
                        "allowed_tools": ["portfolio.get_overview"],
                        "local_only": False,
                    },
                }
            ),
            config_type="json",
            module_name="mcp",
            enabled=True,
        )
    )
    client = McpOAuthClient(
        client_id="chatgpt-client",
        client_secret_ciphertext=encrypt_client_secret("chatgpt-secret", key),
        token_endpoint_auth_method=auth_method,
        client_name="ChatGPT",
        mcp_profile_name="chatgpt",
        redirect_uris_json=json.dumps([CALLBACK_URI]),
        grant_types_json=json.dumps(["authorization_code", "refresh_token"]),
        scope="mcp offline_access",
        enabled=enabled,
    )
    user = UserAccount(
        username="admin",
        password_hash=hash_password("correct-password"),
        status="active",
    )
    db.add_all([client, user])
    db.commit()
    db.refresh(client)
    return client


def make_provider(session_factory, key: bytes):
    from invest_assistant.modules.basic.mcp.oauth.provider import LiuliOAuthProvider

    return LiuliOAuthProvider(
        session_factory=session_factory,
        issuer_url=ISSUER_URL,
        resource_url=RESOURCE_URL,
        master_key=key,
        access_token_minutes=15,
        refresh_token_days=30,
    )


def params():
    return AuthorizationParams(
        state="state-value",
        scopes=["mcp", "offline_access"],
        code_challenge="a" * 43,
        redirect_uri=CALLBACK_URI,
        redirect_uri_provided_explicitly=True,
        resource=RESOURCE_URL,
    )


def authorize_user(session_factory, client, provider):
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthAuthorizationRequest
    from invest_assistant.modules.basic.mcp.oauth.security import hash_credential
    from invest_assistant.modules.basic.mcp.oauth.service import complete_authorization

    client_info = asyncio.run(provider.get_client(client.client_id))
    assert client_info is not None
    login_url = asyncio.run(provider.authorize(client_info, params()))
    request_id = parse_qs(urlparse(login_url).query)["request_id"][0]
    db = session_factory()
    request_record = db.query(McpOAuthAuthorizationRequest).filter(
        McpOAuthAuthorizationRequest.request_id_hash == hash_credential(request_id)
    ).one()
    result = complete_authorization(
        db,
        request_id=request_id,
        csrf_token=provider.csrf_token_for_request(request_id),
        username="admin",
        password="correct-password",
        approved=True,
        now=utc_now(),
    )
    assert result.authorization_code is not None
    return client_info, result.authorization_code


def test_provider_decrypts_registered_client(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.security import load_or_create_master_key

    key = load_or_create_master_key(tmp_path / "master.key", create=True)
    db = oauth_session_factory()
    add_provider_config(db, key, auth_method="client_secret_post")
    provider = make_provider(oauth_session_factory, key)

    client = asyncio.run(provider.get_client("chatgpt-client"))

    assert client is not None
    assert client.client_secret == "chatgpt-secret"
    assert client.token_endpoint_auth_method == "client_secret_post"
    assert [str(uri) for uri in client.redirect_uris or []] == [CALLBACK_URI]
    assert client.grant_types == ["authorization_code", "refresh_token"]
    assert client.scope == "mcp offline_access"
    assert asyncio.run(provider.get_client("unknown")) is None


def test_provider_rejects_disabled_client_and_dynamic_registration(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.security import load_or_create_master_key
    from mcp.shared.auth import OAuthClientInformationFull

    key = load_or_create_master_key(tmp_path / "master.key", create=True)
    db = oauth_session_factory()
    add_provider_config(db, key, enabled=False)
    provider = make_provider(oauth_session_factory, key)

    assert asyncio.run(provider.get_client("chatgpt-client")) is None
    try:
        asyncio.run(
            provider.register_client(
                OAuthClientInformationFull(client_id="dynamic", redirect_uris=[CALLBACK_URI])
            )
        )
    except NotImplementedError:
        pass
    else:
        raise AssertionError("dynamic registration must be disabled")


def test_provider_authorize_creates_pending_login_redirect(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthAuthorizationRequest
    from invest_assistant.modules.basic.mcp.oauth.security import load_or_create_master_key

    key = load_or_create_master_key(tmp_path / "master.key", create=True)
    db = oauth_session_factory()
    add_provider_config(db, key)
    provider = make_provider(oauth_session_factory, key)
    client = asyncio.run(provider.get_client("chatgpt-client"))
    assert client is not None

    login_url = asyncio.run(provider.authorize(client, params()))

    parsed = urlparse(login_url)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == f"{ISSUER_URL}/oauth/login"
    assert parse_qs(parsed.query)["request_id"][0]
    assert db.query(McpOAuthAuthorizationRequest).count() == 1


def test_provider_accepts_oauth_access_and_legacy_bearer(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.security import load_or_create_master_key

    key = load_or_create_master_key(tmp_path / "master.key", create=True)
    db = oauth_session_factory()
    client = add_provider_config(db, key)
    provider = make_provider(oauth_session_factory, key)
    client_info, raw_code = authorize_user(oauth_session_factory, client, provider)
    authorization_code = asyncio.run(provider.load_authorization_code(client_info, raw_code))
    assert authorization_code is not None
    oauth_token = asyncio.run(provider.exchange_authorization_code(client_info, authorization_code))

    oauth_access = asyncio.run(provider.load_access_token(oauth_token.access_token))
    legacy_access = asyncio.run(provider.load_access_token("legacy-token"))

    assert oauth_access is not None and oauth_access.client_id == "chatgpt"
    assert oauth_access.resource == RESOURCE_URL
    assert legacy_access is not None and legacy_access.client_id == "codex"
    assert legacy_access.scopes == ["mcp"]
    assert asyncio.run(provider.load_access_token("unknown-token")) is None


def test_provider_refreshes_and_revokes_oauth_tokens(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.security import load_or_create_master_key

    key = load_or_create_master_key(tmp_path / "master.key", create=True)
    db = oauth_session_factory()
    client = add_provider_config(db, key)
    provider = make_provider(oauth_session_factory, key)
    client_info, raw_code = authorize_user(oauth_session_factory, client, provider)
    authorization_code = asyncio.run(provider.load_authorization_code(client_info, raw_code))
    assert authorization_code is not None
    first = asyncio.run(provider.exchange_authorization_code(client_info, authorization_code))
    assert first.refresh_token is not None
    refresh = asyncio.run(provider.load_refresh_token(client_info, first.refresh_token))
    assert refresh is not None

    second = asyncio.run(provider.exchange_refresh_token(client_info, refresh, ["mcp", "offline_access"]))
    access = asyncio.run(provider.load_access_token(second.access_token))
    assert access is not None
    asyncio.run(provider.revoke_token(access))

    assert asyncio.run(provider.load_access_token(second.access_token)) is None
