import sqlite3
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.dialects import sqlite

from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.modules.basic.report_library.service import _filter_reports_by_kind
from invest_assistant.modules.basic.report_library import router as report_router
from invest_assistant.shared.pagination import Page


@pytest.mark.parametrize(
    "kind, expected",
    [
        ("stock", [1, 4]),
        ("track", [2, 13]),
        ("market", [3]),
        ("portfolio", [5, 6, 7, 8, 9]),
        ("other", [10, 11, 12]),
        (None, list(range(1, 14))),
    ],
)
def test_report_kind_includes_module_uploads_and_legacy_targets(kind, expected):
    statement = _filter_reports_by_kind(select(Report.id).order_by(Report.id), kind)
    sql = str(statement.compile(dialect=sqlite.dialect(), compile_kwargs={"literal_binds": True}))
    # 只在内存中对常量行执行 SELECT，不创建、修改或清空任何数据库表。
    with sqlite3.connect(":memory:") as connection:
        rows = connection.execute(
            "WITH report(id, source_module, target_type, report_type, title) AS (VALUES "
            "(1, 'stock_analysis', NULL, 'mcp_upload', '美的集团-2026-11-05-趋势研究'),"
            "(2, 'track_discovery', NULL, 'mcp_upload', 'AI算力研究'),"
            "(3, 'market_radar', NULL, 'mcp_upload', '每日观察'),"
            "(4, 'knowledge_base', 'stock', 'research', '历史研究'),"
            "(5, 'portfolio', NULL, 'mcp_upload', '持仓复盘'),"
            "(6, 'knowledge_base', 'portfolio', 'research', '历史复盘'),"
            "(7, 'knowledge_base', NULL, 'mcp_upload', '实盘组合-2026-11-05-微操报告'),"
            "(8, 'knowledge_base', NULL, '微操报告', '配置分析'),"
            "(9, 'knowledge_base', NULL, 'portfolio_review', '配置复盘'),"
            "(10, 'knowledge_base', NULL, 'mcp_upload', '专题观察'),"
            "(11, 'alert_center', NULL, 'mcp_upload', '事件备忘'),"
            "(12, 'report_library', 'custom', 'mcp_upload', '研究方法笔记'),"
            "(13, 'knowledge_base', NULL, 'mcp_upload', '赛道专题')) " + sql
        ).fetchall()
    assert [row[0] for row in rows] == expected


def test_report_api_accepts_other_with_pagination(monkeypatch):
    app = FastAPI()
    app.include_router(report_router.router)
    db = object()
    app.dependency_overrides[report_router.get_db] = lambda: db
    app.dependency_overrides[report_router.get_current_user] = lambda: object()
    list_page = Mock(return_value=Page(items=[], total=0, limit=50, offset=50, has_more=False))
    monkeypatch.setattr(report_router.service, "list_reports_page", list_page)

    with TestClient(app) as client:
        response = client.get("/api/reports?report_kind=other&offset=50&limit=50")

    assert response.status_code == 200
    assert response.json()["has_more"] is False
    list_page.assert_called_once_with(db, limit=50, offset=50, report_kind="other")
