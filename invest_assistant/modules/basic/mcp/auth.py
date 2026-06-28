import json
import secrets
from dataclasses import dataclass

from sqlalchemy.orm import Session

from invest_assistant.modules.basic.system_config.models import SystemConfig

MCP_CLIENTS_CONFIG_KEY = "mcp.clients"
DEFAULT_MCP_CLIENT_MAX_RESULT_LIMIT = 50
MAX_MCP_CLIENT_RESULT_LIMIT = 100


@dataclass(frozen=True)
class McpClientConfig:
    name: str
    enabled: bool
    token: str
    allowed_tools: list[str]
    max_result_limit: int = DEFAULT_MCP_CLIENT_MAX_RESULT_LIMIT
    local_only: bool = True


def normalize_result_limit(value: int | None) -> int:
    if value is None:
        return DEFAULT_MCP_CLIENT_MAX_RESULT_LIMIT
    return max(1, min(int(value), MAX_MCP_CLIENT_RESULT_LIMIT))


def load_mcp_clients(db: Session) -> list[McpClientConfig]:
    config = db.query(SystemConfig).filter(SystemConfig.config_key == MCP_CLIENTS_CONFIG_KEY).one_or_none()
    if config is None or not config.enabled:
        return []
    try:
        raw_clients = json.loads(config.config_value or "{}")
    except json.JSONDecodeError:
        return []
    if not isinstance(raw_clients, dict):
        return []

    clients: list[McpClientConfig] = []
    for name, raw_client in raw_clients.items():
        if not isinstance(name, str) or not isinstance(raw_client, dict):
            continue
        token = raw_client.get("token")
        if not isinstance(token, str) or not token:
            continue
        allowed_tools = raw_client.get("allowed_tools", [])
        if not isinstance(allowed_tools, list):
            allowed_tools = []
        clients.append(
            McpClientConfig(
                name=name,
                enabled=bool(raw_client.get("enabled", True)),
                token=token,
                allowed_tools=[str(item) for item in allowed_tools if isinstance(item, str) and item],
                max_result_limit=normalize_result_limit(raw_client.get("max_result_limit")),
                local_only=bool(raw_client.get("local_only", True)),
            )
        )
    return clients


def authenticate_token(db: Session, token: str | None) -> McpClientConfig | None:
    if not token:
        return None
    for client in load_mcp_clients(db):
        if client.enabled and secrets.compare_digest(client.token, token):
            return client
    return None


def get_client_config(db: Session, client_name: str | None) -> McpClientConfig | None:
    if not client_name:
        return None
    for client in load_mcp_clients(db):
        if client.enabled and client.name == client_name:
            return client
    return None


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.strip().partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def is_tool_allowed(client: McpClientConfig, tool_name: str) -> bool:
    return tool_name in set(client.allowed_tools)
