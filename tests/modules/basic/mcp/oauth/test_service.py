import json
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from mcp.server.auth.provider import AuthorizationParams

from invest_assistant.shared.time_utils import utc_now

OAUTH_RESOURCE = "https://example.com/mcp"
CALLBACK_URI = "https://chatgpt.com/connector/oauth/callback"


def add_oauth_client(db, *, enabled: bool = True):
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthClient

    client = McpOAuthClient(
        client_id="chatgpt-client",
        client_secret_ciphertext="encrypted-secret",
        token_endpoint_auth_method="client_secret_basic",
        client_name="ChatGPT",
        mcp_profile_name="chatgpt",
        redirect_uris_json=json.dumps([CALLBACK_URI]),
        grant_types_json=json.dumps(["authorization_code", "refresh_token"]),
        scope="mcp offline_access",
        enabled=enabled,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def authorization_params(**overrides):
    values = {
        "state": "chatgpt-state",
        "scopes": ["mcp", "offline_access"],
        "code_challenge": "a" * 43,
        "redirect_uri": CALLBACK_URI,
        "redirect_uri_provided_explicitly": True,
        "resource": OAUTH_RESOURCE,
    }
    values.update(overrides)
    return AuthorizationParams(**values)


def add_profile_and_user(db):
    from invest_assistant.modules.basic.auth.models import UserAccount
    from invest_assistant.modules.basic.auth.security import hash_password
    from invest_assistant.modules.basic.system_config.models import SystemConfig

    db.add(
        SystemConfig(
            config_key="mcp.clients",
            config_value=json.dumps(
                {
                    "chatgpt": {
                        "enabled": True,
                        "auth_modes": ["oauth"],
                        "allowed_tools": ["portfolio.get_overview"],
                        "local_only": False,
                    }
                }
            ),
            config_type="json",
            module_name="mcp",
            enabled=True,
        )
    )
    user = UserAccount(
        username="admin",
        password_hash=hash_password("correct-password"),
        display_name="Admin",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def issue_oauth_tokens(db, client, *, now=None):
    from invest_assistant.modules.basic.mcp.oauth.service import (
        complete_authorization,
        create_authorization_request,
        exchange_code,
    )

    current_time = now or utc_now()
    pending = create_authorization_request(
        db,
        client,
        authorization_params(),
        resource_url=OAUTH_RESOURCE,
        now=current_time,
    )
    authorized = complete_authorization(
        db,
        request_id=pending.request_id,
        csrf_token=pending.csrf_token,
        username="admin",
        password="correct-password",
        approved=True,
        now=current_time,
    )
    assert authorized.authorization_code is not None
    return exchange_code(db, authorized.authorization_code, client.client_id, now=current_time)


def test_create_authorization_request_hashes_browser_secrets(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthAuthorizationRequest
    from invest_assistant.modules.basic.mcp.oauth.security import hash_credential
    from invest_assistant.modules.basic.mcp.oauth.service import create_authorization_request

    db = oauth_session_factory()
    client = add_oauth_client(db)
    now = utc_now()

    pending = create_authorization_request(
        db,
        client,
        authorization_params(),
        resource_url=OAUTH_RESOURCE,
        now=now,
    )

    record = db.query(McpOAuthAuthorizationRequest).one()
    assert record.request_id_hash == hash_credential(pending.request_id)
    assert record.csrf_hash == hash_credential(pending.csrf_token)
    assert pending.request_id not in record.request_id_hash
    assert pending.csrf_token not in record.csrf_hash
    assert record.scope == "mcp offline_access"
    assert record.resource == OAUTH_RESOURCE
    assert record.expires_at == (now + timedelta(minutes=10)).replace(tzinfo=None)


@pytest.mark.parametrize(
    ("params", "message"),
    [
        (authorization_params(redirect_uri="https://attacker.example/callback"), "redirect_uri"),
        (authorization_params(resource="https://other.example/mcp"), "resource"),
        (authorization_params(scopes=["offline_access"]), "mcp"),
        (authorization_params(scopes=["mcp", "admin"]), "scope"),
        (authorization_params(code_challenge="short"), "code_challenge"),
    ],
)
def test_create_authorization_request_rejects_invalid_parameters(
    oauth_session_factory, params, message
):
    from invest_assistant.modules.basic.mcp.oauth.service import OAuthRequestError, create_authorization_request

    db = oauth_session_factory()
    client = add_oauth_client(db)

    with pytest.raises(OAuthRequestError, match=message):
        create_authorization_request(db, client, params, resource_url=OAUTH_RESOURCE)


def test_create_authorization_request_rejects_disabled_client(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.service import OAuthRequestError, create_authorization_request

    db = oauth_session_factory()
    client = add_oauth_client(db, enabled=False)

    with pytest.raises(OAuthRequestError, match="disabled"):
        create_authorization_request(db, client, authorization_params(), resource_url=OAUTH_RESOURCE)


def test_complete_authorization_creates_one_time_code_and_redirect(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.models import (
        McpOAuthAuthorizationCode,
        McpOAuthAuthorizationRequest,
    )
    from invest_assistant.modules.basic.mcp.oauth.security import hash_credential
    from invest_assistant.modules.basic.mcp.oauth.service import (
        complete_authorization,
        create_authorization_request,
    )

    db = oauth_session_factory()
    client = add_oauth_client(db)
    user = add_profile_and_user(db)
    now = utc_now()
    pending = create_authorization_request(
        db, client, authorization_params(), resource_url=OAUTH_RESOURCE, now=now
    )

    result = complete_authorization(
        db,
        request_id=pending.request_id,
        csrf_token=pending.csrf_token,
        username="admin",
        password="correct-password",
        approved=True,
        now=now,
    )

    query = parse_qs(urlparse(result.redirect_url).query)
    code = query["code"][0]
    assert result.authorization_code == code
    assert query["state"] == ["chatgpt-state"]
    assert db.query(McpOAuthAuthorizationRequest).one().consumed_at is not None
    code_record = db.query(McpOAuthAuthorizationCode).one()
    assert code_record.code_hash == hash_credential(code)
    assert code not in code_record.code_hash
    assert code_record.user_id == user.id
    assert code_record.expires_at == (now + timedelta(minutes=5)).replace(tzinfo=None)


def test_complete_authorization_rejects_bad_login_after_five_attempts(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthAuthorizationRequest
    from invest_assistant.modules.basic.mcp.oauth.service import (
        OAuthLoginError,
        OAuthRequestError,
        complete_authorization,
        create_authorization_request,
    )

    db = oauth_session_factory()
    client = add_oauth_client(db)
    add_profile_and_user(db)
    pending = create_authorization_request(
        db, client, authorization_params(), resource_url=OAUTH_RESOURCE
    )

    for _ in range(5):
        with pytest.raises(OAuthLoginError, match="用户名或密码错误"):
            complete_authorization(
                db,
                request_id=pending.request_id,
                csrf_token=pending.csrf_token,
                username="admin",
                password="wrong-password",
                approved=True,
            )

    assert db.query(McpOAuthAuthorizationRequest).one().failed_attempts == 5
    with pytest.raises(OAuthRequestError, match="invalid or expired"):
        complete_authorization(
            db,
            request_id=pending.request_id,
            csrf_token=pending.csrf_token,
            username="admin",
            password="correct-password",
            approved=True,
        )


def test_complete_authorization_denial_returns_access_denied(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.service import (
        complete_authorization,
        create_authorization_request,
    )

    db = oauth_session_factory()
    client = add_oauth_client(db)
    pending = create_authorization_request(
        db, client, authorization_params(), resource_url=OAUTH_RESOURCE
    )

    result = complete_authorization(
        db,
        request_id=pending.request_id,
        csrf_token=pending.csrf_token,
        username="",
        password="",
        approved=False,
    )

    query = parse_qs(urlparse(result.redirect_url).query)
    assert query == {"error": ["access_denied"], "state": ["chatgpt-state"]}
    assert result.authorization_code is None


def test_exchange_code_issues_hashed_access_and_refresh_tokens(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthToken
    from invest_assistant.modules.basic.mcp.oauth.security import hash_credential
    from invest_assistant.modules.basic.mcp.oauth.service import (
        complete_authorization,
        create_authorization_request,
        exchange_code,
        load_code_record,
    )

    db = oauth_session_factory()
    client = add_oauth_client(db)
    add_profile_and_user(db)
    now = utc_now()
    pending = create_authorization_request(
        db, client, authorization_params(), resource_url=OAUTH_RESOURCE, now=now
    )
    authorized = complete_authorization(
        db,
        request_id=pending.request_id,
        csrf_token=pending.csrf_token,
        username="admin",
        password="correct-password",
        approved=True,
        now=now,
    )
    raw_code = authorized.authorization_code
    assert raw_code is not None
    assert load_code_record(db, raw_code, client.client_id, now=now) is not None

    token = exchange_code(
        db,
        raw_code,
        client.client_id,
        access_token_minutes=15,
        refresh_token_days=30,
        now=now,
    )

    assert token.token_type == "Bearer"
    assert token.expires_in == 900
    assert token.scope == "mcp offline_access"
    assert token.refresh_token is not None
    records = db.query(McpOAuthToken).all()
    assert {record.token_type for record in records} == {"access", "refresh"}
    assert hash_credential(token.access_token) in {record.token_hash for record in records}
    assert hash_credential(token.refresh_token) in {record.token_hash for record in records}
    assert all(token.access_token not in record.token_hash for record in records)
    assert load_code_record(db, raw_code, client.client_id, now=now) is None


def test_exchange_code_rejects_second_consumption(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.service import (
        OAuthGrantError,
        complete_authorization,
        create_authorization_request,
        exchange_code,
    )

    db = oauth_session_factory()
    client = add_oauth_client(db)
    add_profile_and_user(db)
    pending = create_authorization_request(
        db, client, authorization_params(), resource_url=OAUTH_RESOURCE
    )
    authorized = complete_authorization(
        db,
        request_id=pending.request_id,
        csrf_token=pending.csrf_token,
        username="admin",
        password="correct-password",
        approved=True,
    )
    raw_code = authorized.authorization_code
    assert raw_code is not None
    exchange_code(db, raw_code, client.client_id)

    with pytest.raises(OAuthGrantError, match="invalid_grant"):
        exchange_code(db, raw_code, client.client_id)


def test_refresh_rotation_replay_revokes_the_whole_family(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthToken
    from invest_assistant.modules.basic.mcp.oauth.service import (
        OAuthGrantError,
        exchange_refresh,
        load_access_record,
        load_refresh_record,
    )

    db = oauth_session_factory()
    client = add_oauth_client(db)
    add_profile_and_user(db)
    now = utc_now()
    original = issue_oauth_tokens(db, client, now=now)
    assert original.refresh_token is not None
    assert load_refresh_record(db, original.refresh_token, client.client_id, now=now) is not None

    rotated = exchange_refresh(
        db,
        original.refresh_token,
        client.client_id,
        ["mcp", "offline_access"],
        now=now + timedelta(minutes=1),
    )

    assert rotated.refresh_token is not None
    assert rotated.refresh_token != original.refresh_token
    assert load_access_record(
        db, rotated.access_token, resource_url=OAUTH_RESOURCE, now=now + timedelta(minutes=1)
    ) is not None

    with pytest.raises(OAuthGrantError, match="reuse"):
        exchange_refresh(
            db,
            original.refresh_token,
            client.client_id,
            ["mcp", "offline_access"],
            now=now + timedelta(minutes=2),
        )

    assert load_access_record(
        db, rotated.access_token, resource_url=OAUTH_RESOURCE, now=now + timedelta(minutes=2)
    ) is None
    family_ids = {
        record.refresh_family_id
        for record in db.query(McpOAuthToken).all()
        if record.refresh_family_id is not None
    }
    assert len(family_ids) == 1
    assert all(record.revoked_at is not None for record in db.query(McpOAuthToken).all())


def test_refresh_rejects_scope_expansion(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.service import OAuthGrantError, exchange_refresh

    db = oauth_session_factory()
    client = add_oauth_client(db)
    add_profile_and_user(db)
    token = issue_oauth_tokens(db, client)
    assert token.refresh_token is not None

    with pytest.raises(OAuthGrantError, match="invalid_scope"):
        exchange_refresh(db, token.refresh_token, client.client_id, ["mcp", "admin"])


def test_access_token_requires_matching_resource_and_enabled_profile(oauth_session_factory):
    from invest_assistant.modules.basic.mcp.oauth.service import load_access_record
    from invest_assistant.modules.basic.system_config.models import SystemConfig

    db = oauth_session_factory()
    client = add_oauth_client(db)
    add_profile_and_user(db)
    now = utc_now()
    token = issue_oauth_tokens(db, client, now=now)

    assert load_access_record(db, token.access_token, resource_url=OAUTH_RESOURCE, now=now) is not None
    assert load_access_record(
        db, token.access_token, resource_url="https://other.example/mcp", now=now
    ) is None

    config = db.query(SystemConfig).filter(SystemConfig.config_key == "mcp.clients").one()
    raw = json.loads(config.config_value)
    raw["chatgpt"]["enabled"] = False
    config.config_value = json.dumps(raw)
    db.commit()

    assert load_access_record(db, token.access_token, resource_url=OAUTH_RESOURCE, now=now) is None
