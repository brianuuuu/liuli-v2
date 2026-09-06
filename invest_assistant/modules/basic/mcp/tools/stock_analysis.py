from datetime import date

from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.projection import TAIL, resolve_sections, select_sections, trim_field
from invest_assistant.modules.basic.mcp.service import execute_read_tool
from invest_assistant.modules.stock_analysis import service as stock_service

STOCK_PROFILE_SECTIONS: dict[str, tuple[str, ...]] = {
    "score": ("latest_score", "score_history"),
    "valuation": ("latest_valuation", "valuation_history"),
    "materials": ("materials",),
    "disclosures": ("disclosures",),
    "tracks": ("tracks",),
    "notes": ("notes",),
    "tags": ("tags",),
}
DEFAULT_STOCK_PROFILE_SECTIONS = ("score", "valuation", "tracks")
DEFAULT_STOCK_PROFILE_HISTORY_LIMIT = 20


def list_pool(*, db, client: McpClientConfig, q: str | None = None, limit: int = 50) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="stock_analysis.list_pool",
        arguments={"q": q, "limit": limit},
        handler=stock_service.list_pool,
    )


def get_stock_profile(
    *,
    db,
    client: McpClientConfig,
    stock_id: int,
    sections: list[str] | None = None,
    history_limit: int = DEFAULT_STOCK_PROFILE_HISTORY_LIMIT,
) -> dict:
    state = {"truncated": False}

    def handler(session, stock_id: int) -> dict:
        wanted = resolve_sections(sections, STOCK_PROFILE_SECTIONS, DEFAULT_STOCK_PROFILE_SECTIONS)
        detail = stock_service.get_stock_detail(session, stock_id)
        if detail is None:
            raise FileNotFoundError(f"stock not found: {stock_id}")
        select_sections(detail, wanted, STOCK_PROFILE_SECTIONS)
        state["truncated"] = any(
            [
                trim_field(detail, "score_history", history_limit, TAIL),
                trim_field(detail, "valuation_history", history_limit, TAIL),
                trim_field(detail, "materials", history_limit),
                trim_field(detail, "disclosures", history_limit),
                trim_field(detail, "notes", history_limit),
                trim_field(detail, "tags", history_limit),
            ]
        )
        return detail

    result = execute_read_tool(
        db=db,
        client=client,
        tool_name="stock_analysis.get_stock_profile",
        arguments={"stock_id": stock_id},
        handler=handler,
    )
    if state["truncated"]:
        result["truncated"] = True
    return result


def get_daily_bars(
    *,
    db,
    client: McpClientConfig,
    stock_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 50,
) -> dict:
    def handler(session, stock_id: int, start_date: date | None, end_date: date | None, limit: int):
        rows = stock_service.list_cached_stock_daily_bars(
            session,
            stock_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )
        if rows is None:
            raise FileNotFoundError(f"stock not found: {stock_id}")
        return rows

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
        handler=handler,
    )
