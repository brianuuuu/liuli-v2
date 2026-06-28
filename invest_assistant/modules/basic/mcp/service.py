from collections.abc import Callable
from time import perf_counter

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.mcp.auth import McpClientConfig, is_tool_allowed, normalize_result_limit
from invest_assistant.modules.basic.mcp.registry import get_tool_metadata


def serialize_for_mcp(value):
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return jsonable_encoder(value)


def effective_limit(client: McpClientConfig, requested_limit: int | None) -> int:
    client_limit = normalize_result_limit(client.max_result_limit)
    if requested_limit is None:
        return client_limit
    return max(1, min(int(requested_limit), client_limit))


def execute_read_tool(
    *,
    db: Session,
    client: McpClientConfig,
    tool_name: str,
    arguments: dict,
    handler: Callable,
) -> dict:
    metadata = get_tool_metadata(tool_name)
    if metadata is None:
        raise PermissionError(f"MCP tool not registered: {tool_name}")
    if metadata.get("read_only") is not True:
        raise PermissionError(f"MCP tool is not read-only: {tool_name}")
    if not is_tool_allowed(client, tool_name):
        raise PermissionError(f"MCP tool not allowed for client {client.name}: {tool_name}")

    requested_limit = arguments.get("limit")
    limit = effective_limit(client, requested_limit if requested_limit is not None else None)
    call_arguments = {**arguments, "limit": limit}
    started_at = perf_counter()
    result = handler(db, **call_arguments)
    duration_ms = int((perf_counter() - started_at) * 1000)
    return _shape_result(result, limit=limit, requested_limit=requested_limit, duration_ms=duration_ms)


def execute_write_tool(
    *,
    db: Session,
    client: McpClientConfig,
    tool_name: str,
    arguments: dict,
    handler: Callable,
) -> dict:
    metadata = get_tool_metadata(tool_name)
    if metadata is None:
        raise PermissionError(f"MCP tool not registered: {tool_name}")
    if metadata.get("read_only") is not False:
        raise PermissionError(f"MCP tool is not a write tool: {tool_name}")
    if not is_tool_allowed(client, tool_name):
        raise PermissionError(f"MCP tool not allowed for client {client.name}: {tool_name}")

    started_at = perf_counter()
    result = handler(db, **arguments)
    duration_ms = int((perf_counter() - started_at) * 1000)
    return {"data": serialize_for_mcp(result), "duration_ms": duration_ms, "truncated": False}


def _shape_result(result, *, limit: int, requested_limit: int | None, duration_ms: int) -> dict:
    serialized = serialize_for_mcp(result)
    limit_truncated = requested_limit is not None and int(requested_limit) > limit
    if isinstance(serialized, dict) and {"items", "total", "limit", "offset", "has_more"}.issubset(serialized):
        items = serialized.get("items") or []
        return {
            "items": items,
            "total": serialized.get("total"),
            "limit": serialized.get("limit"),
            "offset": serialized.get("offset"),
            "has_more": serialized.get("has_more"),
            "count": len(items),
            "duration_ms": duration_ms,
            "truncated": bool(serialized.get("has_more")) or limit_truncated,
        }
    if isinstance(serialized, list):
        items = serialized[:limit]
        return {
            "items": items,
            "count": len(items),
            "limit": limit,
            "duration_ms": duration_ms,
            "truncated": len(serialized) > limit or limit_truncated,
        }
    return {"data": serialized, "duration_ms": duration_ms, "truncated": False}
