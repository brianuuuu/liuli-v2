import json
from collections.abc import Callable
from datetime import date
from time import perf_counter
from urllib.parse import urlparse

from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from invest_assistant.bootstrap.database import SessionLocal
from invest_assistant.bootstrap.config import get_settings
from invest_assistant.modules.basic.mcp.auth import McpClientConfig, authenticate_token, get_client_config
from invest_assistant.modules.basic.mcp.debug_logger import stack_trace_from_exception, write_mcp_call_log
from invest_assistant.modules.basic.mcp.registry import get_tool_metadata
from invest_assistant.modules.basic.mcp.tools import market_radar, portfolio, report_library, stock_analysis, track_discovery

MCP_SCOPE = "mcp"
MCP_INSTRUCTIONS = (
    "本 MCP 服务只暴露 liuli 的受控投资研究数据查询能力。默认工具均为只读，禁止下单建议、"
    "禁止绕过业务模块直接写库、禁止读取任意文件。优先使用 market_radar、track_discovery、"
    "stock_analysis、report_library、portfolio 的查询工具，并在回答中区分事实数据、系统推断和外部参考。"
)


class SystemConfigTokenVerifier:
    async def verify_token(self, token: str) -> AccessToken | None:
        db = SessionLocal()
        try:
            client = authenticate_token(db, token)
            if client is None:
                return None
            return AccessToken(token=token, client_id=client.name, scopes=[MCP_SCOPE])
        finally:
            db.close()


def create_liuli_mcp_server() -> FastMCP:
    public_base_url = _normalized_public_base_url()
    server = FastMCP(
        name="liuli",
        instructions=MCP_INSTRUCTIONS,
        token_verifier=SystemConfigTokenVerifier(),
        auth=AuthSettings(
            issuer_url=public_base_url,
            resource_server_url=f"{public_base_url}/mcp",
            required_scopes=[MCP_SCOPE],
        ),
        streamable_http_path="/",
        stateless_http=False,
        json_response=True,
        transport_security=TransportSecuritySettings(
            allowed_hosts=_allowed_hosts_for_public_base_url(public_base_url),
            allowed_origins=_allowed_origins_for_public_base_url(public_base_url),
        ),
    )
    _register_tools(server)
    return server


def create_mcp_asgi_app():
    return create_liuli_mcp_server().streamable_http_app()


def _normalized_public_base_url() -> str:
    return get_settings().mcp_public_base_url.rstrip("/")


def _allowed_hosts_for_public_base_url(public_base_url: str) -> list[str]:
    parsed = urlparse(public_base_url)
    hosts = ["127.0.0.1", "127.0.0.1:*", "localhost", "localhost:*", "testserver"]
    if parsed.hostname:
        hosts.extend([parsed.hostname, f"{parsed.hostname}:*"])
    if parsed.netloc:
        hosts.append(parsed.netloc)
    return list(dict.fromkeys(hosts))


def _allowed_origins_for_public_base_url(public_base_url: str) -> list[str]:
    parsed = urlparse(public_base_url)
    origins = ["http://127.0.0.1:*", "http://localhost:*", "http://testserver"]
    if parsed.scheme and parsed.hostname:
        origins.append(f"{parsed.scheme}://{parsed.hostname}:*")
    if parsed.scheme and parsed.netloc:
        origins.append(f"{parsed.scheme}://{parsed.netloc}")
    return list(dict.fromkeys(origins))


def _register_tools(server: FastMCP) -> None:
    @server.tool(name="market_radar.search_source_items")
    def mcp_market_radar_search_source_items(
        ctx: Context,
        q: str | None = None,
        source_name: str | None = None,
        source_type: str | None = None,
        important_only: bool = False,
        tag_id: int | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        return _run_tool(
            ctx,
            "market_radar.search_source_items",
            {"q": q, "source_name": source_name, "source_type": source_type, "important_only": important_only, "tag_id": tag_id, "limit": limit, "offset": offset},
            market_radar.search_source_items,
        )

    @server.tool(name="market_radar.get_hotwords")
    def mcp_market_radar_get_hotwords(
        ctx: Context,
        status: str | None = None,
        q: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        return _run_tool(
            ctx,
            "market_radar.get_hotwords",
            {"status": status, "q": q, "limit": limit, "offset": offset},
            market_radar.get_hotwords,
        )

    @server.tool(name="market_radar.get_tag_trend")
    def mcp_market_radar_get_tag_trend(ctx: Context, tag_id: int, limit: int = 50) -> dict:
        return _run_tool(ctx, "market_radar.get_tag_trend", {"tag_id": tag_id, "limit": limit}, market_radar.get_tag_trend)

    @server.tool(name="track_discovery.list_tracks")
    def mcp_track_discovery_list_tracks(
        ctx: Context,
        status: str | None = None,
        q: str | None = None,
        limit: int = 50,
    ) -> dict:
        return _run_tool(
            ctx,
            "track_discovery.list_tracks",
            {"status": status, "q": q, "limit": limit},
            track_discovery.list_tracks,
        )

    @server.tool(name="track_discovery.get_track_detail")
    def mcp_track_discovery_get_track_detail(ctx: Context, track_id: int) -> dict:
        return _run_tool(
            ctx,
            "track_discovery.get_track_detail",
            {"track_id": track_id},
            track_discovery.get_track_detail,
        )

    @server.tool(name="stock_analysis.get_stock_profile")
    def mcp_stock_analysis_get_stock_profile(ctx: Context, stock_id: int) -> dict:
        return _run_tool(
            ctx,
            "stock_analysis.get_stock_profile",
            {"stock_id": stock_id},
            stock_analysis.get_stock_profile,
        )

    @server.tool(name="stock_analysis.get_daily_bars")
    def mcp_stock_analysis_get_daily_bars(
        ctx: Context,
        stock_id: int,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 50,
    ) -> dict:
        return _run_tool(
            ctx,
            "stock_analysis.get_daily_bars",
            {"stock_id": stock_id, "start_date": _parse_optional_date(start_date), "end_date": _parse_optional_date(end_date), "limit": limit},
            stock_analysis.get_daily_bars,
        )

    @server.tool(name="report_library.list_reports")
    def mcp_report_library_list_reports(ctx: Context, limit: int = 50, offset: int = 0) -> dict:
        return _run_tool(
            ctx,
            "report_library.list_reports",
            {"limit": limit, "offset": offset},
            report_library.list_reports,
        )

    @server.tool(name="report_library.read_report_content")
    def mcp_report_library_read_report_content(ctx: Context, report_id: int) -> dict:
        return _run_tool(
            ctx,
            "report_library.read_report_content",
            {"report_id": report_id},
            report_library.read_report_content,
        )

    @server.tool(name="portfolio.get_overview")
    def mcp_portfolio_get_overview(ctx: Context, portfolio_id: int | None = None) -> dict:
        return _run_tool(
            ctx,
            "portfolio.get_overview",
            {"portfolio_id": portfolio_id},
            portfolio.get_overview,
        )


def _run_tool(ctx: Context, tool_name: str, arguments: dict, handler: Callable) -> dict:
    db = SessionLocal()
    started_at = perf_counter()
    client: McpClientConfig | None = None
    client_name = _client_name_from_auth_context(ctx)
    try:
        client = get_client_config(db, client_name)
        if client is None:
            raise PermissionError("MCP client is not authorized")
        result = handler(db=db, client=client, **arguments)
        write_mcp_call_log(
            db,
            {
                "client_name": client.name,
                "tool_name": tool_name,
                "read_only": bool((get_tool_metadata(tool_name) or {}).get("read_only")),
                "risk_level": (get_tool_metadata(tool_name) or {}).get("risk_level"),
                "sanitized_arguments": arguments,
                "allowed_tools": client.allowed_tools,
                "service_name": (get_tool_metadata(tool_name) or {}).get("service_name"),
                "duration_ms": int((perf_counter() - started_at) * 1000),
                "status": "success",
                "result_count": result.get("count"),
                "result_size": len(json.dumps(result, ensure_ascii=False, default=str)),
                "truncated": result.get("truncated"),
            },
        )
        return result
    except Exception as exc:
        write_mcp_call_log(
            db,
            {
                "client_name": client.name if client else client_name,
                "tool_name": tool_name,
                "sanitized_arguments": arguments,
                "duration_ms": int((perf_counter() - started_at) * 1000),
                "status": "failed",
                "error_type": type(exc).__name__,
                "error_message": str(exc),
                "stack_trace": stack_trace_from_exception(exc),
            },
        )
        raise
    finally:
        db.close()


def _parse_optional_date(value: str | None) -> date | None:
    if value is None or value == "":
        return None
    return date.fromisoformat(value)


def _client_name_from_auth_context(ctx: Context) -> str | None:
    token = get_access_token()
    if token is not None and token.client_id:
        return token.client_id
    return ctx.client_id
