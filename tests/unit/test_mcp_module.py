import json
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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
