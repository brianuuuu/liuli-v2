from datetime import date, datetime, timezone

import pytest
from pydantic_core import PydanticSerializationError

from invest_assistant.modules.basic.mcp.auth import McpClientConfig
from invest_assistant.modules.basic.mcp.server import _tool_error
from invest_assistant.modules.basic.mcp.tools import portfolio, report_library, stock_analysis
from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.shared.pagination import make_page


CLIENT = McpClientConfig(
    name="test",
    enabled=True,
    token="test-token",
    allowed_tools=["report_library.list_reports", "stock_analysis.get_stock_profile"],
)


def test_portfolio_review_mcp_preserves_filters_and_identity(monkeypatch):
    arguments = {}
    def review(_db, **kwargs):
        arguments.update(kwargs)
        return {"reports": [{"researcher_code": "portfolio_002", "researcher_name": "组合趋势进攻师"}],
                "summary": {"report_count": 25}}
    monkeypatch.setattr(portfolio.adjust_advice_service, "list_adjust_advice_reviews", review)
    client = McpClientConfig(name="test", enabled=True, token="test", allowed_tools=["portfolio.list_adjust_advice_reviews", "portfolio.list_position_changes"])
    result = portfolio.list_adjust_advice_reviews(
        db=object(), client=client, researcher_code="portfolio_002", aggregate_only=True,
        start_date=date(2026, 10, 1), end_date=date(2026, 11, 12), limit=1,
    )
    assert arguments == {"portfolio_id": None, "limit": 1, "researcher_code": "portfolio_002",
                         "start_date": date(2026, 10, 1), "end_date": date(2026, 11, 12), "aggregate_only": True}
    assert result["data"]["reports"][0]["researcher_name"] == "组合趋势进攻师"
    assert result["data"]["summary"]["report_count"] == 25


def test_position_change_mcp_preserves_researcher_filter(monkeypatch):
    arguments = {}
    def changes(_db, **kwargs):
        arguments.update(kwargs)
        return [{"researcher_code": "portfolio_002", "researcher_name": "组合趋势进攻师"}]
    monkeypatch.setattr(portfolio.portfolio_service, "list_position_changes", changes)
    client = McpClientConfig(name="test", enabled=True, token="test", allowed_tools=["portfolio.list_adjust_advice_reviews", "portfolio.list_position_changes"])
    result = portfolio.list_position_changes(db=object(), client=client, researcher_code="portfolio_002")
    assert arguments["researcher_code"] == "portfolio_002"
    assert result["items"][0]["researcher_name"] == "组合趋势进攻师"


def test_report_list_serializes_orm_items_with_report_schema(monkeypatch):
    now = datetime.now(timezone.utc)
    item = Report(
        id=1,
        title="万东医疗",
        report_type="stock",
        source_module="stock_analysis",
        file_path="reports/stock.md",
        file_format="md",
        generated_by="manual",
        status="published",
        created_at=now,
        updated_at=now,
    )
    monkeypatch.setattr(
        report_library.report_service,
        "list_reports_page",
        lambda _db, **_arguments: make_page([item], total=1, limit=1, offset=0),
    )

    result = report_library.list_reports(db=object(), client=CLIENT, q="万东医疗", limit=1)

    assert result["items"][0]["title"] == "万东医疗"
    assert result["items"][0]["created_at"] == now.isoformat().replace("+00:00", "Z")
    assert result["count"] == 1


def test_serialization_errors_are_internal():
    error = _tool_error(PydanticSerializationError("cannot serialize ORM value"))

    assert str(error) == "[INTERNAL] cannot serialize ORM value"


def test_stock_profile_omits_history_by_default(monkeypatch):
    monkeypatch.setattr(
        stock_analysis.stock_service,
        "get_stock_detail",
        lambda _db, _stock_id: {
            "stock": {"id": 448},
            "summary": {},
            "latest_score": {"id": 2},
            "score_history": [{"id": 1}, {"id": 2}],
            "latest_valuation": {"id": 4},
            "valuation_history": [{"id": 3}, {"id": 4}],
            "tracks": [],
        },
    )

    result = stock_analysis.get_stock_profile(db=object(), client=CLIENT, stock_id=448)

    assert "score_history" not in result["data"]
    assert "valuation_history" not in result["data"]
    assert result["data"]["latest_score"] == {"id": 2}
    assert result["data"]["latest_valuation"] == {"id": 4}


def test_stock_profile_returns_explicit_history_and_enforces_limit(monkeypatch):
    monkeypatch.setattr(
        stock_analysis.stock_service,
        "get_stock_detail",
        lambda _db, _stock_id: {
            "stock": {"id": 448},
            "summary": {},
            "score_history": [{"id": 1}, {"id": 2}],
            "valuation_history": [{"id": 3}, {"id": 4}],
        },
    )

    result = stock_analysis.get_stock_profile(
        db=object(),
        client=CLIENT,
        stock_id=448,
        sections=["score_history", "valuation_history"],
        history_limit=1,
    )

    assert result["data"]["score_history"] == [{"id": 2}]
    assert result["data"]["valuation_history"] == [{"id": 4}]
    assert result["data"]["score_history_total"] == 2
    assert result["data"]["valuation_history_total"] == 2
    assert result["truncated"] is True

    for invalid_limit in (0, 101):
        with pytest.raises(ValueError, match="history_limit must be between 1 and 100"):
            stock_analysis.get_stock_profile(
                db=object(),
                client=CLIENT,
                stock_id=448,
                history_limit=invalid_limit,
            )
