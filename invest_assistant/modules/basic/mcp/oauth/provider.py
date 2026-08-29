import json
from pathlib import Path
from typing import Any
from urllib.parse import quote

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    RefreshToken,
    TokenError,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.config import Settings
from invest_assistant.modules.basic.mcp.auth import authenticate_token
from invest_assistant.modules.basic.mcp.oauth.models import McpOAuthClient
from invest_assistant.modules.basic.mcp.oauth.security import (
    decrypt_client_secret,
    derive_csrf_token,
    generate_credential,
    load_or_create_master_key,
)
from invest_assistant.modules.basic.mcp.oauth.service import (
    OAuthGrantError,
    OAuthRequestError,
    create_authorization_request,
    exchange_code,
    exchange_refresh,
    load_access_record,
    load_code_record,
    load_refresh_record,
    load_token_record,
    revoke_token_family,
)
from invest_assistant.shared.time_utils import BEIJING_TZ


class LiuliOAuthProvider:
    def __init__(
        self,
        *,
        session_factory: sessionmaker[Session],
        issuer_url: str,
        resource_url: str,
        master_key: bytes,
        access_token_minutes: int,
        refresh_token_days: int,
    ) -> None:
        self._session_factory = session_factory
        self.issuer_url = issuer_url.rstrip("/")
        self.resource_url = resource_url.rstrip("/")
        self._master_key = master_key
        self._access_token_minutes = access_token_minutes
        self._refresh_token_days = refresh_token_days

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        db = self._session_factory()
        try:
            record = db.scalar(
                select(McpOAuthClient).where(
                    McpOAuthClient.client_id == client_id,
                    McpOAuthClient.enabled.is_(True),
                )
            )
            if record is None:
                return None
            redirect_uris = _json_string_list(record.redirect_uris_json)
            grant_types = _json_string_list(record.grant_types_json)
            if not redirect_uris or not grant_types:
                return None
            return OAuthClientInformationFull(
                client_id=record.client_id,
                client_secret=decrypt_client_secret(record.client_secret_ciphertext, self._master_key),
                client_name=record.client_name,
                redirect_uris=redirect_uris,
                token_endpoint_auth_method=record.token_endpoint_auth_method,
                grant_types=grant_types,
                response_types=["code"],
                scope=record.scope,
                client_id_issued_at=int(_as_timestamp(record.created_at)),
            )
        finally:
            db.close()

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        raise NotImplementedError("dynamic client registration is disabled")

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        if not client.client_id:
            raise AuthorizeError("unauthorized_client", "OAuth client is missing a client_id")
        db = self._session_factory()
        try:
            record = db.scalar(
                select(McpOAuthClient).where(
                    McpOAuthClient.client_id == client.client_id,
                    McpOAuthClient.enabled.is_(True),
                )
            )
            if record is None:
                raise AuthorizeError("unauthorized_client", "OAuth client is disabled or unknown")
            request_id_seed = generate_credential()
            csrf_token = self.csrf_token_for_request(request_id_seed)
            try:
                pending = create_authorization_request(
                    db,
                    record,
                    params,
                    resource_url=self.resource_url,
                    csrf_token=csrf_token,
                    request_id=request_id_seed,
                )
            except OAuthRequestError as exc:
                raise AuthorizeError("invalid_request", str(exc)) from exc
            return f"{self.issuer_url}/oauth/login?request_id={quote(pending.request_id, safe='')}"
        finally:
            db.close()

    async def load_authorization_code(
        self,
        client: OAuthClientInformationFull,
        authorization_code: str,
    ) -> AuthorizationCode | None:
        if not client.client_id:
            return None
        db = self._session_factory()
        try:
            record = load_code_record(db, authorization_code, client.client_id)
            if record is None:
                return None
            return AuthorizationCode(
                code=authorization_code,
                scopes=record.scope.split(),
                expires_at=_as_timestamp(record.expires_at),
                client_id=client.client_id,
                code_challenge=record.code_challenge,
                redirect_uri=record.redirect_uri,
                redirect_uri_provided_explicitly=True,
                resource=record.resource,
                subject=str(record.user_id),
            )
        finally:
            db.close()

    async def exchange_authorization_code(
        self,
        client: OAuthClientInformationFull,
        authorization_code: AuthorizationCode,
    ) -> OAuthToken:
        if not client.client_id:
            raise TokenError("invalid_client", "OAuth client is missing a client_id")
        db = self._session_factory()
        try:
            try:
                return exchange_code(
                    db,
                    authorization_code.code,
                    client.client_id,
                    access_token_minutes=self._access_token_minutes,
                    refresh_token_days=self._refresh_token_days,
                )
            except OAuthGrantError as exc:
                raise TokenError(exc.error, exc.description) from exc
        finally:
            db.close()

    async def load_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: str,
    ) -> RefreshToken | None:
        if not client.client_id:
            return None
        db = self._session_factory()
        try:
            record = load_refresh_record(db, refresh_token, client.client_id)
            if record is None:
                return None
            return RefreshToken(
                token=refresh_token,
                client_id=client.client_id,
                scopes=record.scope.split(),
                expires_at=int(_as_timestamp(record.expires_at)),
                subject=str(record.user_id),
            )
        finally:
            db.close()

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        if not client.client_id:
            raise TokenError("invalid_client", "OAuth client is missing a client_id")
        db = self._session_factory()
        try:
            try:
                return exchange_refresh(
                    db,
                    refresh_token.token,
                    client.client_id,
                    scopes,
                    access_token_minutes=self._access_token_minutes,
                    refresh_token_days=self._refresh_token_days,
                )
            except OAuthGrantError as exc:
                raise TokenError(exc.error, exc.description) from exc
        finally:
            db.close()

    async def load_access_token(self, token: str) -> AccessToken | None:
        db = self._session_factory()
        try:
            record = load_access_record(db, token, resource_url=self.resource_url)
            if record is not None:
                return AccessToken(
                    token=token,
                    client_id=record.mcp_profile_name,
                    scopes=record.scope.split(),
                    expires_at=int(_as_timestamp(record.expires_at)),
                    resource=record.resource,
                    subject=str(record.user_id),
                )
            legacy_client = authenticate_token(db, token)
            if legacy_client is None:
                return None
            return AccessToken(token=token, client_id=legacy_client.name, scopes=["mcp"])
        finally:
            db.close()

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        db = self._session_factory()
        try:
            record = load_token_record(db, token.token)
            if record is None:
                return
            revoke_token_family(db, record)
            db.commit()
        finally:
            db.close()

    def csrf_token_for_request(self, request_id: str) -> str:
        return derive_csrf_token(self._master_key, request_id)


def build_oauth_provider(
    settings: Settings,
    *,
    session_factory: sessionmaker[Session] | None = None,
) -> LiuliOAuthProvider:
    if session_factory is None:
        from invest_assistant.bootstrap.database import SessionLocal

        session_factory = SessionLocal
    master_key = load_or_create_master_key(Path(settings.mcp_oauth_master_key_file), create=False)
    return LiuliOAuthProvider(
        session_factory=session_factory,
        issuer_url=settings.mcp_oauth_issuer_url,
        resource_url=settings.mcp_oauth_resource_url,
        master_key=master_key,
        access_token_minutes=settings.mcp_oauth_access_token_minutes,
        refresh_token_days=settings.mcp_oauth_refresh_token_days,
    )


def _json_string_list(value: str) -> list[str]:
    try:
        parsed: Any = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, str) and item]


def _as_timestamp(value) -> float:
    resolved = value if value.tzinfo is not None else value.replace(tzinfo=BEIJING_TZ)
    return resolved.timestamp()
