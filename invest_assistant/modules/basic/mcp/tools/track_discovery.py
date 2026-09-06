from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.projection import resolve_sections, select_sections, trim_field
from invest_assistant.modules.basic.mcp.service import execute_read_tool
from invest_assistant.modules.track_discovery import service as track_service

TRACK_DETAIL_SECTIONS: dict[str, tuple[str, ...]] = {
    "materials": ("materials",),
    "snapshots": ("analysis_snapshots",),
    "stocks": ("stocks",),
    "tags": ("tags",),
    "heat": ("heat_trends",),
}
DEFAULT_TRACK_DETAIL_SECTIONS = ("stocks", "tags")
DEFAULT_TRACK_DETAIL_LIST_LIMIT = 20


def list_tracks(
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
        tool_name="track_discovery.list_tracks",
        arguments={"status": status, "q": q, "limit": limit, "offset": offset},
        handler=track_service.list_tracks,
    )


def get_track_detail(
    *,
    db,
    client: McpClientConfig,
    track_id: int,
    sections: list[str] | None = None,
    list_limit: int = DEFAULT_TRACK_DETAIL_LIST_LIMIT,
) -> dict:
    state = {"truncated": False}

    def handler(session, track_id: int) -> dict:
        wanted = resolve_sections(sections, TRACK_DETAIL_SECTIONS, DEFAULT_TRACK_DETAIL_SECTIONS)
        detail = track_service.get_track_detail(session, track_id)
        if detail is None:
            raise FileNotFoundError(f"track not found: {track_id}")
        select_sections(detail, wanted, TRACK_DETAIL_SECTIONS)
        state["truncated"] = any(
            [
                trim_field(detail, "materials", list_limit),
                trim_field(detail, "analysis_snapshots", list_limit),
                trim_field(detail, "stocks", list_limit),
                trim_field(detail, "heat_trends", list_limit),
            ]
        )
        return detail

    result = execute_read_tool(
        db=db,
        client=client,
        tool_name="track_discovery.get_track_detail",
        arguments={"track_id": track_id},
        handler=handler,
    )
    if state["truncated"]:
        result["truncated"] = True
    return result
