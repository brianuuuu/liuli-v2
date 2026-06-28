from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.service import execute_read_tool
from invest_assistant.modules.track_discovery import service as track_service


def list_tracks(
    *,
    db,
    client: McpClientConfig,
    status: str | None = None,
    q: str | None = None,
    limit: int = 50,
) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="track_discovery.list_tracks",
        arguments={"status": status, "q": q, "limit": limit},
        handler=track_service.list_tracks,
    )


def get_track_detail(*, db, client: McpClientConfig, track_id: int, limit: int = 1) -> dict:
    return execute_read_tool(
        db=db,
        client=client,
        tool_name="track_discovery.get_track_detail",
        arguments={"track_id": track_id, "limit": limit},
        handler=lambda session, track_id, limit: track_service.get_track_detail(session, track_id),
    )
