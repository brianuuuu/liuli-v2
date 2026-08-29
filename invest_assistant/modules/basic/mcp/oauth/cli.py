import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, TextIO
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.config import Settings, get_settings
from invest_assistant.modules.basic.mcp.auth import get_client_config, supports_auth_mode
from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthClient, McpOAuthToken
from invest_assistant.modules.basic.mcp.oauth.security import (
    encrypt_client_secret,
    generate_credential,
    load_or_create_master_key,
)
from invest_assistant.shared.time_utils import utc_now

TOKEN_AUTH_METHODS = ("client_secret_basic", "client_secret_post")


@dataclass(frozen=True)
class ProvisionedClient:
    client_id: str
    client_secret: str


def provision_client(
    db: Session,
    settings: Settings,
    *,
    name: str,
    redirect_uri: str,
    profile_name: str,
    token_auth_method: str,
) -> ProvisionedClient:
    _validate_redirect_uri(redirect_uri)
    if token_auth_method not in TOKEN_AUTH_METHODS:
        raise ValueError("token auth method must be client_secret_basic or client_secret_post")
    profile = get_client_config(db, profile_name)
    if profile is None or not profile.enabled or not supports_auth_mode(profile, "oauth"):
        raise ValueError("OAuth MCP profile is missing or disabled")

    key = load_or_create_master_key(Path(settings.mcp_oauth_master_key_file), create=True)
    client_id = _unique_client_id(db)
    client_secret = generate_credential()
    db.add(
        McpOAuthClient(
            client_id=client_id,
            client_secret_ciphertext=encrypt_client_secret(client_secret, key),
            token_endpoint_auth_method=token_auth_method,
            client_name=name.strip() or "ChatGPT",
            mcp_profile_name=profile_name,
            redirect_uris_json=json.dumps([redirect_uri]),
            grant_types_json=json.dumps(["authorization_code", "refresh_token"]),
            scope="mcp offline_access",
            enabled=True,
        )
    )
    db.commit()
    return ProvisionedClient(client_id=client_id, client_secret=client_secret)


def rotate_client_secret(db: Session, settings: Settings, client_id: str) -> ProvisionedClient:
    client = db.scalar(select(McpOAuthClient).where(McpOAuthClient.client_id == client_id))
    if client is None:
        raise ValueError("OAuth client does not exist")
    key = load_or_create_master_key(Path(settings.mcp_oauth_master_key_file), create=False)
    client_secret = generate_credential()
    client.client_secret_ciphertext = encrypt_client_secret(client_secret, key)
    _revoke_client_tokens(db, client.id)
    db.commit()
    return ProvisionedClient(client_id=client.client_id, client_secret=client_secret)


def disable_client(db: Session, client_id: str) -> str:
    client = db.scalar(select(McpOAuthClient).where(McpOAuthClient.client_id == client_id))
    if client is None:
        raise ValueError("OAuth client does not exist")
    client.enabled = False
    _revoke_client_tokens(db, client.id)
    db.commit()
    return client.client_id


def main(
    argv: list[str] | None = None,
    *,
    session_factory: sessionmaker[Session] | None = None,
    settings: Settings | None = None,
    stdout: TextIO | None = None,
    input_fn: Callable[[str], str] = input,
) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    resolved_settings = settings or get_settings()
    output = stdout or sys.stdout
    if session_factory is None:
        from invest_assistant.bootstrap.database import SessionLocal

        session_factory = SessionLocal
    db = session_factory()
    try:
        if args.command == "provision-client":
            result = provision_client(
                db,
                resolved_settings,
                name=_required(args.name, "Client name: ", input_fn),
                redirect_uri=_required(args.redirect_uri, "ChatGPT callback URI: ", input_fn),
                profile_name=_required(args.profile, "MCP profile: ", input_fn),
                token_auth_method=args.token_auth_method,
            )
            output.write(f"client_id={result.client_id}\n")
            output.write(f"client_secret={result.client_secret}\n")
        elif args.command == "rotate-secret":
            result = rotate_client_secret(
                db,
                resolved_settings,
                _required(args.client_id, "Client ID: ", input_fn),
            )
            output.write(f"client_id={result.client_id}\n")
            output.write(f"client_secret={result.client_secret}\n")
        elif args.command == "disable-client":
            client_id = disable_client(db, _required(args.client_id, "Client ID: ", input_fn))
            output.write(f"disabled_client_id={client_id}\n")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage fixed OAuth clients for the liuli MCP server")
    subparsers = parser.add_subparsers(dest="command", required=True)

    provision = subparsers.add_parser("provision-client")
    provision.add_argument("--name")
    provision.add_argument("--redirect-uri")
    provision.add_argument("--profile")
    provision.add_argument(
        "--token-auth-method",
        choices=TOKEN_AUTH_METHODS,
        default="client_secret_basic",
    )

    rotate = subparsers.add_parser("rotate-secret")
    rotate.add_argument("--client-id")

    disable = subparsers.add_parser("disable-client")
    disable.add_argument("--client-id")
    return parser


def _validate_redirect_uri(redirect_uri: str) -> None:
    parsed = urlparse(redirect_uri)
    local_http = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
    if not parsed.hostname or (parsed.scheme != "https" and not local_http) or parsed.fragment:
        raise ValueError("OAuth redirect URI must use HTTPS, except for localhost development")


def _unique_client_id(db: Session) -> str:
    for _ in range(5):
        candidate = f"liuli_{generate_credential(18)}"
        exists = db.scalar(select(McpOAuthClient.id).where(McpOAuthClient.client_id == candidate))
        if exists is None:
            return candidate
    raise RuntimeError("could not generate a unique OAuth client ID")


def _revoke_client_tokens(db: Session, client_id: int) -> None:
    current_time = utc_now()
    records = db.scalars(select(McpOAuthToken).where(McpOAuthToken.client_id == client_id)).all()
    for record in records:
        if record.revoked_at is None:
            record.revoked_at = current_time


def _required(value: str | None, prompt: str, input_fn: Callable[[str], str]) -> str:
    resolved = value if value is not None else input_fn(prompt)
    resolved = resolved.strip()
    if not resolved:
        raise ValueError(f"{prompt.strip(': ')} is required")
    return resolved


if __name__ == "__main__":
    raise SystemExit(main())
