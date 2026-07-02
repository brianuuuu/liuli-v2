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
from invest_assistant.modules.basic.mcp.tools import knowledge_base, market_radar, portfolio, report_library, stock_analysis, track_discovery

MCP_SCOPE = "mcp"
MCP_INSTRUCTIONS = (
    "本 MCP 服务只暴露 liuli 的受控投资研究数据查询能力。默认工具均为只读，禁止下单建议、"
    "禁止绕过业务模块直接写库、禁止读取任意文件。优先使用 market_radar、track_discovery、"
    "stock_analysis、report_library、portfolio 的查询工具，并在回答中区分事实数据、系统推断和外部参考。"
    "返回内容以中文为主，客户端应按 UTF-8 解码；如终端显示乱码，优先检查客户端或终端编码。"
)
MCP_TOOL_DESCRIPTIONS = {
    "market_radar.search_source_items": (
        "搜索 liuli 已入库的信息流条目，适合查询新闻、公告、快讯、研报摘要等市场信息。"
        "支持关键词 q、来源 source_name、类型 source_type、重要标记 important_only、tag_id、limit、offset 过滤。"
    ),
    "market_radar.get_hotwords": (
        "查询市场雷达热词列表，适合按状态或关键词了解当前已沉淀的热点词。"
        "支持 status、q、limit、offset 过滤。"
    ),
    "market_radar.get_tag_trend": (
        "按已知 tag_id 查询标签热度趋势，用于观察某个标签在信息流中的热度变化。"
        "不要猜测 tag_id；缺少 ID 时先通过信息流或热词查询确认。"
    ),
    "track_discovery.list_tracks": (
        "查询赛道列表，适合按状态或关键词查找赛道候选项，并获取后续 get_track_detail 所需的 track_id。"
        "支持 status、q、limit 过滤。"
    ),
    "track_discovery.get_track_detail": (
        "按已知 track_id 获取赛道详情，包括赛道基础信息、研究材料、相关标的和验证信息。"
        "仅在已知 track_id 时调用，不要猜测 ID。"
    ),
    "stock_analysis.get_stock_profile": (
        "按已知 stock_id 获取本地股票画像和分析信息。仅在已知 stock_id 时调用；"
        "不要把股票代码或证券代码直接当 stock_id。"
    ),
    "stock_analysis.get_daily_bars": (
        "按已知 stock_id 查询本地缓存的股票日 K 数据，可指定 start_date、end_date 和 limit。"
        "该工具只读本地缓存，不触发行情刷新；不要把股票代码直接当 stock_id。"
    ),
    "knowledge_base.get_researcher_profile": (
        "查询研究员组合元信息，适合先获取标的评级师简介和后续读取 Soul/Method 所需 ID。"
        "支持 researcher 按名称、编号或 ID 精确匹配。"
    ),
    "knowledge_base.get_researcher_soul": (
        "按 soul_id 读取研究员 Soul 文件内容。仅在已通过 profile 获取 soul_id 后调用，不要猜测 ID。"
    ),
    "knowledge_base.get_researcher_method": (
        "按 method_id 读取研究员 Method 文件内容。仅在已通过 profile 获取 method_id 后调用，不要猜测 ID。"
    ),
    "report_library.list_reports": (
        "查询报告库列表，适合查找 report_library.read_report_content 所需的 report_id。"
        "支持 limit、offset 分页。"
    ),
    "report_library.read_report_content": (
        "按已知 report_id 读取报告正文内容。仅在已知 report_id 时调用，不要猜测 ID；"
        "缺少 ID 时先使用 report_library.list_reports 查询。"
    ),
    "report_library.upload_markdown_report": (
        "上传 Markdown 报告并写入报告库索引。参数为 title、source_module、markdown；"
        "保存到 var/reports/{source_module}/YYYY-MM/，仅用于显式 allowlist 放开的受控报告入库。"
    ),
    "portfolio.get_overview": (
        "获取组合总览，可查看全部组合或指定 portfolio_id 的现金、持仓市值、总资产、当日盈亏和持仓分布。"
        "portfolio_id 为空时返回全组合汇总。"
    ),
}


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
    @server.tool(name="market_radar.search_source_items", description=MCP_TOOL_DESCRIPTIONS["market_radar.search_source_items"])
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

    @server.tool(name="market_radar.get_hotwords", description=MCP_TOOL_DESCRIPTIONS["market_radar.get_hotwords"])
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

    @server.tool(name="market_radar.get_tag_trend", description=MCP_TOOL_DESCRIPTIONS["market_radar.get_tag_trend"])
    def mcp_market_radar_get_tag_trend(ctx: Context, tag_id: int, limit: int = 50) -> dict:
        return _run_tool(ctx, "market_radar.get_tag_trend", {"tag_id": tag_id, "limit": limit}, market_radar.get_tag_trend)

    @server.tool(name="track_discovery.list_tracks", description=MCP_TOOL_DESCRIPTIONS["track_discovery.list_tracks"])
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

    @server.tool(name="track_discovery.get_track_detail", description=MCP_TOOL_DESCRIPTIONS["track_discovery.get_track_detail"])
    def mcp_track_discovery_get_track_detail(ctx: Context, track_id: int) -> dict:
        return _run_tool(
            ctx,
            "track_discovery.get_track_detail",
            {"track_id": track_id},
            track_discovery.get_track_detail,
        )

    @server.tool(name="stock_analysis.get_stock_profile", description=MCP_TOOL_DESCRIPTIONS["stock_analysis.get_stock_profile"])
    def mcp_stock_analysis_get_stock_profile(ctx: Context, stock_id: int) -> dict:
        return _run_tool(
            ctx,
            "stock_analysis.get_stock_profile",
            {"stock_id": stock_id},
            stock_analysis.get_stock_profile,
        )

    @server.tool(name="stock_analysis.get_daily_bars", description=MCP_TOOL_DESCRIPTIONS["stock_analysis.get_daily_bars"])
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

    @server.tool(name="knowledge_base.get_researcher_profile", description=MCP_TOOL_DESCRIPTIONS["knowledge_base.get_researcher_profile"])
    def mcp_knowledge_base_get_researcher_profile(ctx: Context, researcher: str = "标的评级师") -> dict:
        return _run_tool(
            ctx,
            "knowledge_base.get_researcher_profile",
            {"researcher": researcher},
            knowledge_base.get_researcher_profile,
        )

    @server.tool(name="knowledge_base.get_researcher_soul", description=MCP_TOOL_DESCRIPTIONS["knowledge_base.get_researcher_soul"])
    def mcp_knowledge_base_get_researcher_soul(ctx: Context, soul_id: int) -> dict:
        return _run_tool(
            ctx,
            "knowledge_base.get_researcher_soul",
            {"soul_id": soul_id},
            knowledge_base.get_researcher_soul,
        )

    @server.tool(name="knowledge_base.get_researcher_method", description=MCP_TOOL_DESCRIPTIONS["knowledge_base.get_researcher_method"])
    def mcp_knowledge_base_get_researcher_method(ctx: Context, method_id: int) -> dict:
        return _run_tool(
            ctx,
            "knowledge_base.get_researcher_method",
            {"method_id": method_id},
            knowledge_base.get_researcher_method,
        )

    @server.tool(name="report_library.list_reports", description=MCP_TOOL_DESCRIPTIONS["report_library.list_reports"])
    def mcp_report_library_list_reports(ctx: Context, limit: int = 50, offset: int = 0) -> dict:
        return _run_tool(
            ctx,
            "report_library.list_reports",
            {"limit": limit, "offset": offset},
            report_library.list_reports,
        )

    @server.tool(name="report_library.read_report_content", description=MCP_TOOL_DESCRIPTIONS["report_library.read_report_content"])
    def mcp_report_library_read_report_content(ctx: Context, report_id: int) -> dict:
        return _run_tool(
            ctx,
            "report_library.read_report_content",
            {"report_id": report_id},
            report_library.read_report_content,
        )

    @server.tool(name="report_library.upload_markdown_report", description=MCP_TOOL_DESCRIPTIONS["report_library.upload_markdown_report"])
    def mcp_report_library_upload_markdown_report(ctx: Context, title: str, source_module: str, markdown: str) -> dict:
        return _run_tool(
            ctx,
            "report_library.upload_markdown_report",
            {"title": title, "source_module": source_module, "markdown": markdown},
            report_library.upload_markdown_report,
        )

    @server.tool(name="portfolio.get_overview", description=MCP_TOOL_DESCRIPTIONS["portfolio.get_overview"])
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
                "sanitized_arguments": _sanitize_arguments_for_log(arguments),
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
                "sanitized_arguments": _sanitize_arguments_for_log(arguments),
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


def _sanitize_arguments_for_log(arguments: dict) -> dict:
    sanitized = {}
    for key, value in arguments.items():
        if key in {"markdown", "content"} and isinstance(value, str):
            sanitized[key] = {"content_length": len(value), "content_bytes": len(value.encode("utf-8"))}
            continue
        sanitized[key] = value
    return sanitized


def _client_name_from_auth_context(ctx: Context) -> str | None:
    token = get_access_token()
    if token is not None and token.client_id:
        return token.client_id
    return ctx.client_id
