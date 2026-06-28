from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool
from invest_assistant.modules.portfolio import service as portfolio_service


def get_overview(*, db, client: McpClientConfig, portfolio_id: int | None = None, limit: int = 1) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="portfolio.get_overview",
        arguments={"portfolio_id": portfolio_id, "limit": limit},
        handler=lambda session, portfolio_id, limit: portfolio_service.get_overview(session, portfolio_id),
    )
