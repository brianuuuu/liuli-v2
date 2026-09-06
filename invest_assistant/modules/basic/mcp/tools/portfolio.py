from datetime import date

from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool
from invest_assistant.modules.portfolio import service as portfolio_service


def list_position_changes(
    *,
    db,
    client: McpClientConfig,
    portfolio_id: int | None = None,
    stock_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 100,
) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="portfolio.list_position_changes",
        arguments={
            "portfolio_id": portfolio_id,
            "stock_id": stock_id,
            "start_date": start_date,
            "end_date": end_date,
            "limit": limit,
        },
        handler=portfolio_service.list_position_changes,
    )


def get_overview(*, db, client: McpClientConfig, portfolio_id: int | None = None) -> dict:
    def handler(session, portfolio_id: int | None) -> dict:
        overview = portfolio_service.get_overview(session, portfolio_id)
        if portfolio_id is not None:
            known = {int(item["id"]) for item in overview.get("portfolio_options", []) if item.get("id") is not None}
            if int(portfolio_id) not in known:
                raise FileNotFoundError(f"portfolio not found: {portfolio_id}")
        return overview

    return execute_read_tool(
        db=db,
        client=client,
        tool_name="portfolio.get_overview",
        arguments={"portfolio_id": portfolio_id},
        handler=handler,
    )
