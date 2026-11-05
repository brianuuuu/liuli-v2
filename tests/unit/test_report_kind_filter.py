import sqlite3

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import sqlite

from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.modules.basic.report_library.service import _filter_reports_by_kind


@pytest.mark.parametrize("kind, expected", [("stock", [1, 4]), ("track", [2]), ("market", [3]), (None, [1, 2, 3, 4, 5])])
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
            "(5, 'portfolio', NULL, 'mcp_upload', '微操报告')) " + sql
        ).fetchall()
    assert [row[0] for row in rows] == expected
