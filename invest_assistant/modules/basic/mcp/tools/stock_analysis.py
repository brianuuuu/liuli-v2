from datetime import date

from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool
from invest_assistant.modules.stock_analysis import service as stock_service


def get_stock_profile(*, db, client: McpClientConfig, stock_id: int, limit: int = 1) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="stock_analysis.get_stock_profile",
        arguments={"stock_id": stock_id, "limit": limit},
        handler=lambda session, stock_id, limit: stock_service.get_stock_detail(session, stock_id),
    )


def get_daily_bars(
    *,
    db,
    client: McpClientConfig,
    stock_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    refresh: bool = False,
    limit: int = 50,
) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="stock_analysis.get_daily_bars",
        arguments={
            "stock_id": stock_id,
            "start_date": start_date,
            "end_date": end_date,
            "limit": limit,
        },
        handler=stock_service.list_cached_stock_daily_bars,
    )
