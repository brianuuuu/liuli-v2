from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool
from invest_assistant.modules.market_radar import service as market_service


def search_source_items(
    *,
    db,
    client: McpClientConfig,
    q: str | None = None,
    source_name: str | None = None,
    source_type: str | None = None,
    important_only: bool = False,
    tag_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="market_radar.search_source_items",
        arguments={
            "q": q,
            "source_name": source_name,
            "source_type": source_type,
            "important_only": important_only,
            "tag_id": tag_id,
            "limit": limit,
            "offset": offset,
        },
        handler=market_service.list_source_items_page,
    )


def get_hotwords(
    *,
    db,
    client: McpClientConfig,
    status: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="market_radar.get_hotwords",
        arguments={"status": status, "q": q, "limit": limit, "offset": offset},
        handler=market_service.list_hotwords_page,
    )


def get_tag_trend(*, db, client: McpClientConfig, tag_id: int, limit: int = 50) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="market_radar.get_tag_trend",
        arguments={"tag_id": tag_id, "limit": limit},
        handler=lambda session, tag_id, limit: market_service.tag_trend(session, tag_id)[-limit:],
    )
