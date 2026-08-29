from datetime import timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from invest_assistant.shared.time_utils import utc_now


def make_client():
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthClient

    return McpOAuthClient(
        client_id="chatgpt-client",
        client_secret_ciphertext="encrypted-secret",
        token_endpoint_auth_method="client_secret_basic",
        client_name="ChatGPT",
        mcp_profile_name="chatgpt",
        redirect_uris_json='["https://chatgpt.com/connector/oauth/callback"]',
        grant_types_json='["authorization_code", "refresh_token"]',
        scope="mcp offline_access",
        enabled=True,
    )


def test_oauth_models_register_all_tables():
    import invest_assistant.modules.basic.mcp.oauth.models  # noqa: F401
    from invest_assistant.bootstrap.database import Base

    assert {
        "mcp_oauth_client",
        "mcp_oauth_authorization_request",
        "mcp_oauth_authorization_code",
        "mcp_oauth_token",
    }.issubset(Base.metadata.tables)


def test_oauth_token_hash_is_unique(oauth_session_factory):
    from invest_assistant.modules.basic.auth.models import UserAccount
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthToken

    db = oauth_session_factory()
    client = make_client()
    user = UserAccount(username="admin", password_hash="hash", status="active")
    db.add_all([client, user])
    db.flush()
    expires_at = utc_now() + timedelta(minutes=15)
    common = {
        "token_hash": "same-hash",
        "token_type": "access",
        "client_id": client.id,
        "user_id": user.id,
        "mcp_profile_name": "chatgpt",
        "scope": "mcp",
        "resource": "https://example.com/mcp",
        "expires_at": expires_at,
    }
    db.add(McpOAuthToken(**common))
    db.flush()
    db.add(McpOAuthToken(**common))

    with pytest.raises(IntegrityError):
        db.flush()


def test_oauth_token_type_rejects_unknown_value(oauth_session_factory):
    from invest_assistant.modules.basic.auth.models import UserAccount
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthToken

    db = oauth_session_factory()
    client = make_client()
    user = UserAccount(username="admin", password_hash="hash", status="active")
    db.add_all([client, user])
    db.flush()
    db.add(
        McpOAuthToken(
            token_hash="token-hash",
            token_type="unknown",
            client_id=client.id,
            user_id=user.id,
            mcp_profile_name="chatgpt",
            scope="mcp",
            resource="https://example.com/mcp",
            expires_at=utc_now() + timedelta(minutes=15),
        )
    )

    with pytest.raises(IntegrityError):
        db.flush()
