from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class McpOAuthClient(Base):
    __tablename__ = "mcp_oauth_client"
    __table_args__ = (
        CheckConstraint(
            "token_endpoint_auth_method IN ('client_secret_basic', 'client_secret_post')",
            name="ck_mcp_oauth_client_auth_method",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    client_secret_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    token_endpoint_auth_method: Mapped[str] = mapped_column(String(32), nullable=False)
    client_name: Mapped[str] = mapped_column(String(128), nullable=False)
    mcp_profile_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    redirect_uris_json: Mapped[str] = mapped_column(Text, nullable=False)
    grant_types_json: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class McpOAuthAuthorizationRequest(Base):
    __tablename__ = "mcp_oauth_authorization_request"
    __table_args__ = (
        CheckConstraint("code_challenge_method = 'S256'", name="ck_mcp_oauth_request_pkce_method"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("mcp_oauth_client.id"), nullable=False, index=True)
    redirect_uri: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope: Mapped[str] = mapped_column(String(255), nullable=False)
    resource: Mapped[str] = mapped_column(Text, nullable=False)
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    code_challenge_method: Mapped[str] = mapped_column(String(16), nullable=False, default="S256")
    csrf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class McpOAuthAuthorizationCode(Base):
    __tablename__ = "mcp_oauth_authorization_code"
    __table_args__ = (
        CheckConstraint("code_challenge_method = 'S256'", name="ck_mcp_oauth_code_pkce_method"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("mcp_oauth_client.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), nullable=False, index=True)
    redirect_uri: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(String(255), nullable=False)
    resource: Mapped[str] = mapped_column(Text, nullable=False)
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    code_challenge_method: Mapped[str] = mapped_column(String(16), nullable=False, default="S256")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class McpOAuthToken(Base):
    __tablename__ = "mcp_oauth_token"
    __table_args__ = (
        CheckConstraint("token_type IN ('access', 'refresh')", name="ck_mcp_oauth_token_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    token_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("mcp_oauth_client.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_account.id"), nullable=False, index=True)
    mcp_profile_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String(255), nullable=False)
    resource: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_family_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    parent_token_id: Mapped[int | None] = mapped_column(ForeignKey("mcp_oauth_token.id"), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
