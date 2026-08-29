import json
import hmac
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from mcp.server.auth.provider import AuthorizationParams
from mcp.shared.auth import OAuthToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.basic.auth.service import authenticate_user
from invest_assistant.modules.basic.mcp.auth import get_client_config, supports_auth_mode
from invest_assistant.modules.basic.mcp.oauth.models import (
    McpOAuthAuthorizationCode,
    McpOAuthAuthorizationRequest,
    McpOAuthClient,
    McpOAuthToken,
)
from invest_assistant.modules.basic.mcp.oauth.security import generate_credential, hash_credential
from invest_assistant.shared.time_utils import utc_now

AUTHORIZATION_REQUEST_TTL = timedelta(minutes=10)
AUTHORIZATION_CODE_TTL = timedelta(minutes=5)
ALLOWED_SCOPES = frozenset({"mcp", "offline_access"})
PKCE_S256_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")


class OAuthRequestError(ValueError):
    pass


class OAuthLoginError(ValueError):
    pass


class OAuthGrantError(ValueError):
    def __init__(self, error: str, description: str):
        self.error = error
        self.description = description
        super().__init__(f"{error}: {description}")


@dataclass(frozen=True)
class PendingAuthorization:
    request_id: str
    csrf_token: str
    expires_at: datetime


@dataclass(frozen=True)
class AuthorizationRedirect:
    redirect_url: str
    authorization_code: str | None


def create_authorization_request(
    db: Session,
    client: McpOAuthClient,
    params: AuthorizationParams,
    *,
    resource_url: str,
    csrf_token: str | None = None,
    request_id: str | None = None,
    now: datetime | None = None,
) -> PendingAuthorization:
    current_time = now or utc_now()
    if not client.enabled:
        raise OAuthRequestError("OAuth client is disabled")

    try:
        redirect_uris = json.loads(client.redirect_uris_json)
    except (TypeError, json.JSONDecodeError) as exc:
        raise OAuthRequestError("OAuth client redirect_uri configuration is invalid") from exc
    redirect_uri = str(params.redirect_uri)
    if not isinstance(redirect_uris, list) or redirect_uri not in redirect_uris:
        raise OAuthRequestError("redirect_uri is not registered")
    if params.resource != resource_url:
        raise OAuthRequestError("resource does not match the MCP resource")

    scopes = list(dict.fromkeys(params.scopes or ["mcp"]))
    if "mcp" not in scopes:
        raise OAuthRequestError("mcp scope is required")
    if not set(scopes).issubset(ALLOWED_SCOPES):
        raise OAuthRequestError("scope contains an unsupported value")
    if not PKCE_S256_PATTERN.fullmatch(params.code_challenge):
        raise OAuthRequestError("code_challenge must be a PKCE S256 challenge")

    resolved_request_id = request_id or generate_credential()
    resolved_csrf_token = csrf_token or generate_credential()
    expires_at = current_time + AUTHORIZATION_REQUEST_TTL
    db.add(
        McpOAuthAuthorizationRequest(
            request_id_hash=hash_credential(resolved_request_id),
            client_id=client.id,
            redirect_uri=redirect_uri,
            state=params.state,
            scope=" ".join(scopes),
            resource=resource_url,
            code_challenge=params.code_challenge,
            code_challenge_method="S256",
            csrf_hash=hash_credential(resolved_csrf_token),
            expires_at=expires_at,
        )
    )
    db.commit()
    return PendingAuthorization(request_id=resolved_request_id, csrf_token=resolved_csrf_token, expires_at=expires_at)


def complete_authorization(
    db: Session,
    *,
    request_id: str,
    csrf_token: str,
    username: str,
    password: str,
    approved: bool,
    now: datetime | None = None,
) -> AuthorizationRedirect:
    current_time = now or utc_now()
    request_record = db.scalar(
        select(McpOAuthAuthorizationRequest)
        .where(McpOAuthAuthorizationRequest.request_id_hash == hash_credential(request_id))
        .with_for_update()
    )
    if not _authorization_request_is_active(request_record, current_time):
        raise OAuthRequestError("authorization request is invalid or expired")
    assert request_record is not None
    if not hmac.compare_digest(request_record.csrf_hash, hash_credential(csrf_token)):
        raise OAuthRequestError("authorization request CSRF token is invalid")

    if not approved:
        request_record.consumed_at = current_time
        db.commit()
        return AuthorizationRedirect(
            redirect_url=_redirect_with_query(
                request_record.redirect_uri,
                {"error": "access_denied", "state": request_record.state},
            ),
            authorization_code=None,
        )

    user = authenticate_user(db, username, password)
    if user is None:
        request_record.failed_attempts += 1
        db.commit()
        raise OAuthLoginError("用户名或密码错误")

    raw_code = generate_credential()
    request_record.consumed_at = current_time
    db.add(
        McpOAuthAuthorizationCode(
            code_hash=hash_credential(raw_code),
            client_id=request_record.client_id,
            user_id=user.id,
            redirect_uri=request_record.redirect_uri,
            scope=request_record.scope,
            resource=request_record.resource,
            code_challenge=request_record.code_challenge,
            code_challenge_method=request_record.code_challenge_method,
            expires_at=current_time + AUTHORIZATION_CODE_TTL,
        )
    )
    db.commit()
    return AuthorizationRedirect(
        redirect_url=_redirect_with_query(
            request_record.redirect_uri,
            {"code": raw_code, "state": request_record.state},
        ),
        authorization_code=raw_code,
    )


def load_code_record(
    db: Session,
    raw_code: str,
    client_public_id: str,
    *,
    now: datetime | None = None,
) -> McpOAuthAuthorizationCode | None:
    current_time = now or utc_now()
    record = db.scalar(
        select(McpOAuthAuthorizationCode)
        .join(McpOAuthClient, McpOAuthClient.id == McpOAuthAuthorizationCode.client_id)
        .where(
            McpOAuthAuthorizationCode.code_hash == hash_credential(raw_code),
            McpOAuthClient.client_id == client_public_id,
            McpOAuthClient.enabled.is_(True),
        )
    )
    if record is None or record.consumed_at is not None or _is_expired(record.expires_at, current_time):
        return None
    return record


def exchange_code(
    db: Session,
    raw_code: str,
    client_public_id: str,
    *,
    access_token_minutes: int = 15,
    refresh_token_days: int = 30,
    now: datetime | None = None,
) -> OAuthToken:
    current_time = now or utc_now()
    code_record = db.scalar(
        select(McpOAuthAuthorizationCode)
        .join(McpOAuthClient, McpOAuthClient.id == McpOAuthAuthorizationCode.client_id)
        .where(
            McpOAuthAuthorizationCode.code_hash == hash_credential(raw_code),
            McpOAuthClient.client_id == client_public_id,
            McpOAuthClient.enabled.is_(True),
        )
        .with_for_update()
    )
    if code_record is None or code_record.consumed_at is not None or _is_expired(code_record.expires_at, current_time):
        raise OAuthGrantError("invalid_grant", "authorization code is invalid or expired")

    client = db.get(McpOAuthClient, code_record.client_id)
    user = db.get(UserAccount, code_record.user_id)
    profile = get_client_config(db, client.mcp_profile_name if client else None)
    if (
        client is None
        or not client.enabled
        or user is None
        or user.status != "active"
        or profile is None
        or not profile.enabled
        or not supports_auth_mode(profile, "oauth")
    ):
        raise OAuthGrantError("invalid_grant", "authorization grant is no longer active")

    scopes = code_record.scope.split()
    raw_access = generate_credential()
    raw_refresh = generate_credential() if "offline_access" in scopes else None
    family_id = hash_credential(generate_credential()) if raw_refresh else None
    access_record = McpOAuthToken(
        token_hash=hash_credential(raw_access),
        token_type="access",
        client_id=client.id,
        user_id=user.id,
        mcp_profile_name=client.mcp_profile_name,
        scope=code_record.scope,
        resource=code_record.resource,
        refresh_family_id=family_id,
        expires_at=current_time + timedelta(minutes=access_token_minutes),
    )
    db.add(access_record)
    db.flush()
    if raw_refresh is not None:
        db.add(
            McpOAuthToken(
                token_hash=hash_credential(raw_refresh),
                token_type="refresh",
                client_id=client.id,
                user_id=user.id,
                mcp_profile_name=client.mcp_profile_name,
                scope=code_record.scope,
                resource=code_record.resource,
                refresh_family_id=family_id,
                parent_token_id=access_record.id,
                expires_at=current_time + timedelta(days=refresh_token_days),
            )
        )
    code_record.consumed_at = current_time
    db.commit()
    return OAuthToken(
        access_token=raw_access,
        token_type="Bearer",
        expires_in=access_token_minutes * 60,
        scope=code_record.scope,
        refresh_token=raw_refresh,
    )


def load_refresh_record(
    db: Session,
    raw_refresh_token: str,
    client_public_id: str,
    *,
    now: datetime | None = None,
) -> McpOAuthToken | None:
    current_time = now or utc_now()
    record = db.scalar(
        select(McpOAuthToken)
        .join(McpOAuthClient, McpOAuthClient.id == McpOAuthToken.client_id)
        .where(
            McpOAuthToken.token_hash == hash_credential(raw_refresh_token),
            McpOAuthToken.token_type == "refresh",
            McpOAuthClient.client_id == client_public_id,
            McpOAuthClient.enabled.is_(True),
        )
    )
    if record is None or _is_expired(record.expires_at, current_time):
        return None
    return record


def exchange_refresh(
    db: Session,
    raw_refresh_token: str,
    client_public_id: str,
    scopes: list[str],
    *,
    access_token_minutes: int = 15,
    refresh_token_days: int = 30,
    now: datetime | None = None,
) -> OAuthToken:
    current_time = now or utc_now()
    record = db.scalar(
        select(McpOAuthToken)
        .join(McpOAuthClient, McpOAuthClient.id == McpOAuthToken.client_id)
        .where(
            McpOAuthToken.token_hash == hash_credential(raw_refresh_token),
            McpOAuthToken.token_type == "refresh",
            McpOAuthClient.client_id == client_public_id,
        )
        .with_for_update()
    )
    if record is None or _is_expired(record.expires_at, current_time):
        raise OAuthGrantError("invalid_grant", "refresh token is invalid or expired")
    if record.revoked_at is not None:
        revoke_token_family(db, record, now=current_time)
        db.commit()
        raise OAuthGrantError("invalid_grant", "refresh token reuse detected")

    requested_scopes = list(dict.fromkeys(scopes or record.scope.split()))
    original_scopes = set(record.scope.split())
    if "mcp" not in requested_scopes or not set(requested_scopes).issubset(original_scopes):
        raise OAuthGrantError("invalid_scope", "refresh token scope cannot be expanded")
    if not _oauth_subject_is_active(db, record):
        record.revoked_at = current_time
        db.commit()
        raise OAuthGrantError("invalid_grant", "refresh token subject is no longer active")

    client = db.get(McpOAuthClient, record.client_id)
    assert client is not None
    record.revoked_at = current_time
    if record.parent_token_id is not None:
        parent_access = db.get(McpOAuthToken, record.parent_token_id)
        if parent_access is not None and parent_access.revoked_at is None:
            parent_access.revoked_at = current_time

    scope_value = " ".join(requested_scopes)
    raw_access = generate_credential()
    raw_refresh = generate_credential() if "offline_access" in requested_scopes else None
    access_record = McpOAuthToken(
        token_hash=hash_credential(raw_access),
        token_type="access",
        client_id=record.client_id,
        user_id=record.user_id,
        mcp_profile_name=record.mcp_profile_name,
        scope=scope_value,
        resource=record.resource,
        refresh_family_id=record.refresh_family_id,
        expires_at=current_time + timedelta(minutes=access_token_minutes),
    )
    db.add(access_record)
    db.flush()
    if raw_refresh is not None:
        db.add(
            McpOAuthToken(
                token_hash=hash_credential(raw_refresh),
                token_type="refresh",
                client_id=record.client_id,
                user_id=record.user_id,
                mcp_profile_name=record.mcp_profile_name,
                scope=scope_value,
                resource=record.resource,
                refresh_family_id=record.refresh_family_id,
                parent_token_id=access_record.id,
                expires_at=current_time + timedelta(days=refresh_token_days),
            )
        )
    db.commit()
    return OAuthToken(
        access_token=raw_access,
        token_type="Bearer",
        expires_in=access_token_minutes * 60,
        scope=scope_value,
        refresh_token=raw_refresh,
    )


def load_access_record(
    db: Session,
    raw_access_token: str,
    *,
    resource_url: str,
    now: datetime | None = None,
) -> McpOAuthToken | None:
    current_time = now or utc_now()
    record = db.scalar(
        select(McpOAuthToken).where(
            McpOAuthToken.token_hash == hash_credential(raw_access_token),
            McpOAuthToken.token_type == "access",
            McpOAuthToken.resource == resource_url,
            McpOAuthToken.revoked_at.is_(None),
        )
    )
    if record is None or _is_expired(record.expires_at, current_time):
        return None
    if "mcp" not in record.scope.split() or not _oauth_subject_is_active(db, record):
        return None
    return record


def load_token_record(db: Session, raw_token: str) -> McpOAuthToken | None:
    return db.scalar(select(McpOAuthToken).where(McpOAuthToken.token_hash == hash_credential(raw_token)))


def revoke_token_family(
    db: Session,
    token: McpOAuthToken,
    *,
    now: datetime | None = None,
) -> None:
    current_time = now or utc_now()
    if token.refresh_family_id:
        records = db.scalars(
            select(McpOAuthToken).where(McpOAuthToken.refresh_family_id == token.refresh_family_id)
        ).all()
    else:
        records = [token]
    for record in records:
        if record.revoked_at is None:
            record.revoked_at = current_time


def _oauth_subject_is_active(db: Session, token: McpOAuthToken) -> bool:
    client = db.get(McpOAuthClient, token.client_id)
    user = db.get(UserAccount, token.user_id)
    profile = get_client_config(db, token.mcp_profile_name)
    return bool(
        client is not None
        and client.enabled
        and user is not None
        and user.status == "active"
        and profile is not None
        and profile.enabled
        and supports_auth_mode(profile, "oauth")
    )


def _authorization_request_is_active(
    record: McpOAuthAuthorizationRequest | None,
    now: datetime,
) -> bool:
    return bool(
        record is not None
        and record.consumed_at is None
        and record.failed_attempts < 5
        and not _is_expired(record.expires_at, now)
    )


def _is_expired(expires_at: datetime, now: datetime) -> bool:
    comparable_now = now
    if expires_at.tzinfo is None and now.tzinfo is not None:
        comparable_now = now.replace(tzinfo=None)
    elif expires_at.tzinfo is not None and now.tzinfo is None:
        comparable_now = now.replace(tzinfo=expires_at.tzinfo)
    return expires_at <= comparable_now


def _redirect_with_query(url: str, values: dict[str, str | None]) -> str:
    parts = urlsplit(url)
    query = list(parse_qsl(parts.query, keep_blank_values=True))
    query.extend((key, value) for key, value in values.items() if value is not None)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
