import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import invest_assistant.modules.basic.stock_master.models  # noqa: F401
import invest_assistant.modules.track_discovery.models  # noqa: F401
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.system_config.models import SystemConfig


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def add_config(db, key: str, value: str, config_type: str = "json", enabled: bool = True):
    db.add(
        SystemConfig(
            config_key=key,
            config_value=value,
            config_type=config_type,
            module_name="mcp",
            enabled=enabled,
        )
    )
    db.commit()


def test_mcp_client_config_authenticates_enabled_client_and_allowed_tools():
    from invest_assistant.modules.basic.mcp.auth import authenticate_token, is_tool_allowed

    SessionLocal = make_session()
    db = SessionLocal()
    add_config(
        db,
        "mcp.clients",
        json.dumps(
            {
                "codex": {
                    "enabled": True,
                    "token": "secret-token",
                    "allowed_tools": ["market_radar.search_source_items"],
                    "max_result_limit": 20,
                    "local_only": True,
                },
                "opencode": {
                    "enabled": False,
                    "token": "disabled-token",
                    "allowed_tools": ["portfolio.get_overview"],
                },
            }
        ),
    )

    client = authenticate_token(db, "secret-token")

    assert client is not None
    assert client.name == "codex"
    assert client.max_result_limit == 20
    assert is_tool_allowed(client, "market_radar.search_source_items")
    assert not is_tool_allowed(client, "portfolio.get_overview")
    assert authenticate_token(db, "disabled-token") is None
    assert authenticate_token(db, "unknown-token") is None


def test_mcp_debug_logger_rotates_five_archives_and_masks_token(tmp_path):
    from invest_assistant.modules.basic.mcp import debug_logger

    log_path = tmp_path / "mcp_debug.log"
    debug_logger.write_mcp_debug_log(
        log_path=log_path,
        max_bytes=10,
        backup_count=5,
        entry={
            "client_name": "codex",
            "tool_name": "market_radar.search_source_items",
            "sanitized_arguments": {"authorization": "Bearer secret", "q": "AI"},
            "status": "success",
        },
    )
    for index in range(1, 6):
        log_path.with_name(f"mcp_debug.log.{index}").write_text(f"archive-{index}", encoding="utf-8")
    log_path.write_text("current-file-over-limit", encoding="utf-8")

    debug_logger.write_mcp_debug_log(
        log_path=log_path,
        max_bytes=10,
        backup_count=5,
        entry={
            "client_name": "codex",
            "tool_name": "portfolio.get_overview",
            "sanitized_arguments": {"token": "plain-token", "portfolio_id": 1},
            "status": "failed",
        },
    )

    content = log_path.read_text(encoding="utf-8")
    assert "plain-token" not in content
    assert "***" in content
    assert log_path.with_name("mcp_debug.log.1").read_text(encoding="utf-8") == "current-file-over-limit"
    assert log_path.with_name("mcp_debug.log.5").read_text(encoding="utf-8") == "archive-4"


def test_mcp_execute_read_tool_enforces_allowlist_and_limit(monkeypatch):
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.registry import TOOL_REGISTRY
    from invest_assistant.modules.basic.mcp.service import execute_read_tool

    captured = {}

    def fake_tool(db, *, limit: int):
        captured["limit"] = limit
        return [{"id": index} for index in range(limit)]

    client = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["test.echo"],
        max_result_limit=3,
        local_only=True,
    )
    monkeypatch.setitem(
        TOOL_REGISTRY,
        "test.echo",
        {
            "read_only": True,
            "risk_level": "low",
            "service_name": "test.fake_tool",
        },
    )

    result = execute_read_tool(
        db=object(),
        client=client,
        tool_name="test.echo",
        arguments={"limit": 10},
        handler=fake_tool,
    )

    assert captured["limit"] == 3
    assert result["items"] == [{"id": 0}, {"id": 1}, {"id": 2}]
    assert result["truncated"] is True

    try:
        execute_read_tool(
            db=object(),
            client=client,
            tool_name="portfolio.get_overview",
            arguments={},
            handler=lambda db: {},
        )
    except PermissionError as exc:
        assert "not allowed" in str(exc)
    else:
        raise AssertionError("expected PermissionError")


def test_mcp_upload_markdown_report_writes_file_and_index(tmp_path, monkeypatch):
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.tools.report_library import read_report_content, upload_markdown_report
    from invest_assistant.modules.basic.report_library.models import Report
    from invest_assistant.shared.time_utils import BEIJING_TZ

    monkeypatch.chdir(tmp_path)
    SessionLocal = make_session()
    db = SessionLocal()
    client = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["report_library.upload_markdown_report", "report_library.read_report_content"],
        max_result_limit=50,
        local_only=True,
    )

    result = upload_markdown_report(
        db=db,
        client=client,
        title="组合复盘",
        source_module="portfolio",
        markdown="# 组合复盘\n\n正文第一段。\n\n更多内容。",
        now=datetime(2026, 6, 28, 22, 0, 0, tzinfo=BEIJING_TZ),
    )

    data = result["data"]
    assert data["title"] == "组合复盘"
    assert data["source_module"] == "portfolio"
    assert data["status"] == "published"
    assert data["content_size"] > 0
    assert data["file_path"] == "reports/portfolio/2026-06/mcp-upload-20260628-220000.md"
    assert (tmp_path / "var" / data["file_path"]).read_text(encoding="utf-8").startswith("# 组合复盘")

    report = db.get(Report, data["report_id"])
    assert report is not None
    assert report.report_type == "mcp_upload"
    assert report.file_format == "md"
    assert report.generated_by == "mcp"
    assert report.summary == "正文第一段。"

    content = read_report_content(db=db, client=client, report_id=data["report_id"])
    assert content["data"]["content"].startswith("# 组合复盘")


def test_mcp_upload_markdown_report_requires_allowlist(tmp_path, monkeypatch):
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.tools.report_library import upload_markdown_report

    monkeypatch.chdir(tmp_path)
    db = make_session()()
    client = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["report_library.read_report_content"],
        max_result_limit=50,
        local_only=True,
    )

    try:
        upload_markdown_report(db=db, client=client, title="报告", source_module="portfolio", markdown="# 报告")
    except PermissionError as exc:
        assert "not allowed" in str(exc)
    else:
        raise AssertionError("expected PermissionError")


def test_mcp_upload_markdown_report_rejects_invalid_payloads(tmp_path, monkeypatch):
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.tools.report_library import upload_markdown_report

    monkeypatch.chdir(tmp_path)
    db = make_session()()
    client = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["report_library.upload_markdown_report"],
        max_result_limit=50,
        local_only=True,
    )

    cases = [
        {"title": "", "source_module": "portfolio", "markdown": "# 报告"},
        {"title": "报告", "source_module": "../portfolio", "markdown": "# 报告"},
        {"title": "报告", "source_module": "unknown", "markdown": "# 报告"},
        {"title": "报告", "source_module": "portfolio", "markdown": ""},
        {"title": "报告", "source_module": "portfolio", "markdown": "x" * (1024 * 1024 + 1)},
    ]
    for payload in cases:
        try:
            upload_markdown_report(db=db, client=client, **payload)
        except ValueError:
            continue
        raise AssertionError(f"expected ValueError for {payload}")


def test_mcp_stock_daily_bars_wrapper_never_refreshes(monkeypatch):
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.tools.stock_analysis import get_daily_bars

    calls = {}

    def fake_list_cached_stock_daily_bars(db, stock_id, *, start_date=None, end_date=None, limit=50):
        calls["limit"] = limit
        return [{"trade_date": "2026-06-26", "close": 10.0}]

    monkeypatch.setattr(
        "invest_assistant.modules.basic.mcp.tools.stock_analysis.stock_service.list_cached_stock_daily_bars",
        fake_list_cached_stock_daily_bars,
    )
    client = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["stock_analysis.get_daily_bars"],
        max_result_limit=50,
        local_only=True,
    )

    result = get_daily_bars(db=object(), client=client, stock_id=1, refresh=True, limit=100)

    assert calls["limit"] == 50
    assert result["items"] == [{"trade_date": "2026-06-26", "close": 10.0}]


def test_mcp_researcher_tool_returns_single_profile_file(tmp_path, monkeypatch):
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.registry import registered_tool_names
    from invest_assistant.modules.basic.mcp.tools.knowledge_base import get_researcher_profile
    from invest_assistant.modules.knowledge_base import service as knowledge_service
    from invest_assistant.modules.knowledge_base.models import KnowledgeResearcher
    from invest_assistant.shared.time_utils import utc_now

    knowledge_root = tmp_path / "invest_assistant" / "modules" / "knowledge_base"
    external_root = knowledge_root / "external"
    researcher_root = external_root / "researchers"
    profile_file = researcher_root / "analyst_001" / "profile.md"
    profile_file.parent.mkdir(parents=True)
    profile_file.write_text(
        "## 简介 intro\n\n资深金融分析师。\n\n## 价值观 soul\n\n数据优先。\n\n## 方法论 method\n\n按六维评分。\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(knowledge_service, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(knowledge_service, "KNOWLEDGE_BASE_ROOT", knowledge_root)
    monkeypatch.setattr(knowledge_service, "EXTERNAL_ROOT", external_root)
    monkeypatch.setattr(knowledge_service, "RESEARCHER_PROFILE_ROOT", researcher_root)

    SessionLocal = make_session()
    db = SessionLocal()
    now = utc_now()
    researcher = KnowledgeResearcher(
        id=1,
        researcher_code="analyst_001",
        display_name="标的评级师",
        profile_path="external/researchers/analyst_001/profile.md",
        profile_hash="hash",
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(researcher)
    db.commit()
    client = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["knowledge_base.get_researcher_profile"],
        max_result_limit=50,
        local_only=True,
    )

    profile = get_researcher_profile(db=db, client=client, researcher="标的评级师")

    assert profile["data"]["researcher_code"] == "analyst_001"
    assert profile["data"]["display_name"] == "标的评级师"
    assert profile["data"]["profile_path"] == "external/researchers/analyst_001/profile.md"
    assert profile["data"]["intro"] == "资深金融分析师。"
    assert profile["data"]["soul"] == "数据优先。"
    assert profile["data"]["method"] == "按六维评分。"
    assert "knowledge_base.get_researcher_soul" not in registered_tool_names()
    assert "knowledge_base.get_researcher_method" not in registered_tool_names()


def test_mcp_researcher_tools_require_allowlist_and_raise_for_missing_records():
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.tools.knowledge_base import get_researcher_profile

    db = make_session()()
    disallowed = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=[],
        max_result_limit=50,
        local_only=True,
    )
    allowed = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["knowledge_base.get_researcher_profile"],
        max_result_limit=50,
        local_only=True,
    )

    try:
        get_researcher_profile(db=db, client=disallowed, researcher="标的评级师")
    except PermissionError as exc:
        assert "not allowed" in str(exc)
    else:
        raise AssertionError("expected PermissionError")

    try:
        get_researcher_profile(db=db, client=allowed, researcher="不存在")
    except FileNotFoundError as exc:
        assert "researcher not found" in str(exc)
    else:
        raise AssertionError("expected FileNotFoundError")


def test_mcp_asgi_app_rejects_missing_bearer_token():
    from fastapi.testclient import TestClient

    from invest_assistant.modules.basic.mcp.server import create_mcp_asgi_app

    client = TestClient(create_mcp_asgi_app())

    response = client.post("/", json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})

    assert response.status_code in {401, 403}


def test_mcp_asgi_app_accepts_valid_system_config_token(monkeypatch):
    from fastapi.testclient import TestClient

    from invest_assistant.modules.basic.mcp import server

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    db = SessionLocal()
    add_config(
        db,
        "mcp.clients",
        json.dumps({"codex": {"enabled": True, "token": "secret-token", "allowed_tools": ["portfolio.get_overview"]}}),
    )
    db.close()
    monkeypatch.setattr(server, "SessionLocal", SessionLocal)

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1"},
        },
    }
    with TestClient(server.create_mcp_asgi_app()) as client:
        response = client.post(
            "/",
            headers={"Authorization": "Bearer secret-token", "Accept": "application/json, text/event-stream"},
            json=payload,
        )

    assert response.status_code == 200
    assert response.json()["result"]["serverInfo"]["name"] == "liuli"


def test_mcp_tools_list_exposes_chinese_descriptions_and_encoding_instruction(monkeypatch):
    from fastapi.testclient import TestClient

    from invest_assistant.modules.basic.mcp import server

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    db = SessionLocal()
    add_config(
        db,
        "mcp.clients",
        json.dumps({"codex": {"enabled": True, "token": "secret-token", "allowed_tools": ["portfolio.get_overview"]}}),
    )
    db.close()
    monkeypatch.setattr(server, "SessionLocal", SessionLocal)

    init_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1"},
        },
    }
    with TestClient(server.create_mcp_asgi_app()) as client:
        init_response = client.post(
            "/",
            headers={"Authorization": "Bearer secret-token", "Accept": "application/json, text/event-stream"},
            json=init_payload,
        )
        session_id = init_response.headers["mcp-session-id"]
        client.post(
            "/",
            headers={"Authorization": "Bearer secret-token", "Accept": "application/json, text/event-stream", "mcp-session-id": session_id},
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        )
        tools_response = client.post(
            "/",
            headers={"Authorization": "Bearer secret-token", "Accept": "application/json, text/event-stream", "mcp-session-id": session_id},
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        )

    assert "UTF-8" in init_response.json()["result"]["instructions"]
    tools = {item["name"]: item["description"] for item in tools_response.json()["result"]["tools"]}
    assert "信息流" in tools["market_radar.search_source_items"]
    assert "track_id" in tools["track_discovery.get_track_detail"]
    assert "股票代码" in tools["stock_analysis.get_stock_profile"]
    assert "研究员" in tools["knowledge_base.get_researcher_profile"]
    assert "完整研究员 profile" in tools["knowledge_base.get_researcher_profile"]
    assert "knowledge_base.get_researcher_soul" not in tools
    assert "knowledge_base.get_researcher_method" not in tools
    assert "report_id" in tools["report_library.read_report_content"]
    assert "Markdown" in tools["report_library.upload_markdown_report"]
    assert "组合总览" in tools["portfolio.get_overview"]


def test_mount_mcp_app_uses_top_level_mcp_path():
    from fastapi import FastAPI
    from starlette.responses import PlainTextResponse

    from invest_assistant.bootstrap.app import mount_mcp_app

    app = FastAPI()

    async def dummy_app(scope, receive, send):
        response = PlainTextResponse("ok")
        await response(scope, receive, send)

    mount_mcp_app(app, dummy_app)

    assert any(getattr(route, "path", None) == "/mcp" for route in app.routes)


def test_mcp_transport_security_allows_public_base_url_host():
    from invest_assistant.modules.basic.mcp.server import _allowed_hosts_for_public_base_url

    hosts = _allowed_hosts_for_public_base_url("http://115.29.176.240:8000")

    assert "115.29.176.240" in hosts
    assert "115.29.176.240:*" in hosts
    assert "115.29.176.240:8000" in hosts
    assert "127.0.0.1" in hosts


def test_mcp_server_uses_bearer_token_client_id_instead_of_meta_client_id(monkeypatch):
    from types import SimpleNamespace

    from invest_assistant.modules.basic.mcp import server

    monkeypatch.setattr(server, "get_access_token", lambda: SimpleNamespace(client_id="codex"))

    assert server._client_name_from_auth_context(SimpleNamespace(client_id="meta-client")) == "codex"


def test_console_mcp_status_counts_enabled_clients_and_tools():
    from invest_assistant.modules.console.router import mcp_status

    SessionLocal = make_session()
    db = SessionLocal()
    add_config(
        db,
        "mcp.clients",
        json.dumps(
            {
                "codex": {"enabled": True, "token": "secret-token", "allowed_tools": ["portfolio.get_overview"]},
                "opencode": {"enabled": False, "token": "disabled-token", "allowed_tools": ["portfolio.get_overview"]},
            }
        ),
    )
    add_config(db, "mcp.debug_log.enabled", "false", config_type="boolean")

    status = mcp_status(db)

    assert status["status"] == "ok"
    assert status["clients"] == 2
    assert status["enabled_clients"] == 1
    assert status["tools"] >= 1
    assert status["debug_log"] == "disabled"


def test_mcp_registry_marks_upload_report_as_controlled_write_tool():
    from invest_assistant.modules.basic.mcp.registry import get_tool_metadata

    metadata = get_tool_metadata("report_library.upload_markdown_report")

    assert metadata is not None
    assert metadata["read_only"] is False
    assert metadata["risk_level"] == "medium"
