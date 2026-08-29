import io
import json
from datetime import timedelta
from pathlib import Path

import pytest

from invest_assistant.bootstrap.config import Settings
from invest_assistant.shared.time_utils import utc_now

CALLBACK_URI = "https://chatgpt.com/connector/oauth/callback"


def cli_settings(key_path: Path) -> Settings:
    return Settings(
        mcp_oauth_enabled=True,
        mcp_oauth_issuer_url="https://example.com/mcp",
        mcp_oauth_resource_url="https://example.com/mcp",
        mcp_oauth_master_key_file=str(key_path),
    )


def add_chatgpt_profile(db):
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
    db.commit()


def provision(oauth_session_factory, key_path: Path, *, auth_method="client_secret_basic"):
    from invest_assistant.modules.basic.mcp.oauth.cli import main

    output = io.StringIO()
    exit_code = main(
        [
            "provision-client",
            "--name",
            "ChatGPT",
            "--redirect-uri",
            CALLBACK_URI,
            "--profile",
            "chatgpt",
            "--token-auth-method",
            auth_method,
        ],
        session_factory=oauth_session_factory,
        settings=cli_settings(key_path),
        stdout=output,
    )
    assert exit_code == 0
    values = dict(
        line.split("=", 1)
        for line in output.getvalue().splitlines()
        if line.startswith(("client_id=", "client_secret="))
    )
    return values, output.getvalue()


@pytest.mark.parametrize("auth_method", ["client_secret_basic", "client_secret_post"])
def test_provision_client_encrypts_secret_and_outputs_it_once(
    oauth_session_factory, tmp_path: Path, auth_method: str
):
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthClient
    from invest_assistant.modules.basic.mcp.oauth.security import (
        decrypt_client_secret,
        load_or_create_master_key,
    )

    db = oauth_session_factory()
    add_chatgpt_profile(db)
    key_path = tmp_path / "master.key"

    values, output = provision(oauth_session_factory, key_path, auth_method=auth_method)

    client = db.query(McpOAuthClient).one()
    key = load_or_create_master_key(key_path, create=False)
    assert client.client_id == values["client_id"]
    assert client.token_endpoint_auth_method == auth_method
    assert values["client_secret"] not in client.client_secret_ciphertext
    assert decrypt_client_secret(client.client_secret_ciphertext, key) == values["client_secret"]
    assert output.count(values["client_secret"]) == 1
    assert key.decode("ascii") not in output


def test_provision_client_rejects_unregistered_profile_and_insecure_callback(
    oauth_session_factory, tmp_path: Path
):
    from invest_assistant.modules.basic.mcp.oauth.cli import provision_client

    db = oauth_session_factory()
    settings = cli_settings(tmp_path / "master.key")

    with pytest.raises(ValueError, match="OAuth MCP profile"):
        provision_client(
            db,
            settings,
            name="ChatGPT",
            redirect_uri=CALLBACK_URI,
            profile_name="missing",
            token_auth_method="client_secret_basic",
        )

    add_chatgpt_profile(db)
    with pytest.raises(ValueError, match="HTTPS"):
        provision_client(
            db,
            settings,
            name="ChatGPT",
            redirect_uri="http://attacker.example/callback",
            profile_name="chatgpt",
            token_auth_method="client_secret_basic",
        )


def test_rotate_secret_revokes_client_tokens_and_outputs_only_new_secret(
    oauth_session_factory, tmp_path: Path
):
    from invest_assistant.modules.basic.auth.models import UserAccount
    from invest_assistant.modules.basic.mcp.oauth.cli import main
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthClient, McpOAuthToken
    from invest_assistant.modules.basic.mcp.oauth.security import decrypt_client_secret, load_or_create_master_key

    db = oauth_session_factory()
    add_chatgpt_profile(db)
    key_path = tmp_path / "master.key"
    provisioned, _ = provision(oauth_session_factory, key_path)
    client = db.query(McpOAuthClient).one()
    old_ciphertext = client.client_secret_ciphertext
    user = UserAccount(username="admin", password_hash="hash", status="active")
    db.add(user)
    db.flush()
    db.add(
        McpOAuthToken(
            token_hash="token-hash",
            token_type="access",
            client_id=client.id,
            user_id=user.id,
            mcp_profile_name="chatgpt",
            scope="mcp",
            resource="https://example.com/mcp",
            expires_at=utc_now() + timedelta(minutes=15),
        )
    )
    db.commit()
    output = io.StringIO()

    result = main(
        ["rotate-secret", "--client-id", provisioned["client_id"]],
        session_factory=oauth_session_factory,
        settings=cli_settings(key_path),
        stdout=output,
    )

    assert result == 0
    db.expire_all()
    client = db.query(McpOAuthClient).one()
    new_secret = output.getvalue().split("client_secret=", 1)[1].strip()
    assert client.client_secret_ciphertext != old_ciphertext
    assert decrypt_client_secret(
        client.client_secret_ciphertext,
        load_or_create_master_key(key_path, create=False),
    ) == new_secret
    assert output.getvalue().count(new_secret) == 1
    assert db.query(McpOAuthToken).one().revoked_at is not None


def test_disable_client_revokes_tokens(oauth_session_factory, tmp_path: Path):
    from invest_assistant.modules.basic.auth.models import UserAccount
    from invest_assistant.modules.basic.mcp.oauth.cli import main
    from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthClient, McpOAuthToken

    db = oauth_session_factory()
    add_chatgpt_profile(db)
    key_path = tmp_path / "master.key"
    provisioned, _ = provision(oauth_session_factory, key_path)
    client = db.query(McpOAuthClient).one()
    user = UserAccount(username="admin", password_hash="hash", status="active")
    db.add(user)
    db.flush()
    db.add(
        McpOAuthToken(
            token_hash="token-hash",
            token_type="refresh",
            client_id=client.id,
            user_id=user.id,
            mcp_profile_name="chatgpt",
            scope="mcp offline_access",
            resource="https://example.com/mcp",
            refresh_family_id="family",
            expires_at=utc_now() + timedelta(days=30),
        )
    )
    db.commit()

    result = main(
        ["disable-client", "--client-id", provisioned["client_id"]],
        session_factory=oauth_session_factory,
        settings=cli_settings(key_path),
        stdout=io.StringIO(),
    )

    assert result == 0
    db.expire_all()
    assert db.query(McpOAuthClient).one().enabled is False
    assert db.query(McpOAuthToken).one().revoked_at is not None
