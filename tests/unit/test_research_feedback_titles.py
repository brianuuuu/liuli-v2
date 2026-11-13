import json
import re
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy.engine import Engine

from invest_assistant.modules.knowledge_base import service


@pytest.fixture(autouse=True)
def forbid_database_connections(monkeypatch):
    monkeypatch.setattr(Engine, "connect", Mock(side_effect=AssertionError("database access is forbidden")))


@pytest.fixture
def stored_feedback(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    feedback = SimpleNamespace(id=1, report_id=2, status="received", title="")
    report = SimpleNamespace(id=2, file_path="reports/stock_analysis/2026-11/mcp-upload-20261113-220000.md")
    path = service.report_service.resolve_report_path(report)
    path.parent.mkdir(parents=True)
    monkeypatch.setattr(service, "get_research_feedback", Mock(return_value=feedback))
    monkeypatch.setattr(service.report_service, "get_report", Mock(return_value=report))
    return feedback, path


@pytest.mark.parametrize("subject", ["百济神州", "标的池"])
@pytest.mark.parametrize("report_type", ["趋势研究", "标的趋势研究"])
def test_trend_titles_are_pending_and_use_the_same_importer(stored_feedback, monkeypatch, subject, report_type):
    feedback, path = stored_feedback
    feedback.title = f"{subject}-2026-11-10-{report_type}"
    payload = [{"company_code": "688235", "research_date": "2026-11-10", "trend_level": "T2"}]
    path.write_text("```json\n" + json.dumps(payload) + "\n```", encoding="utf-8")
    importer = Mock(return_value={"target": "stock_trend_snapshot", "success_count": 1})
    monkeypatch.setattr(service, "_import_trend_feedback", importer)
    db = object()

    assert service.is_pending_import_feedback(db, feedback)
    assert service.import_research_feedback(db, feedback.id) == importer.return_value
    importer.assert_called_once_with(db, feedback, date(2026, 11, 10), payload)
    assert feedback.title == f"{subject}-2026-11-10-{report_type}"


@pytest.mark.parametrize("report_type", ["趋势研究", "标的趋势研究"])
def test_trend_title_aliases_require_json_arrays(stored_feedback, report_type):
    feedback, path = stored_feedback
    feedback.title = f"百济神州-2026-11-10-{report_type}"
    path.write_text('```json\n{"company_code": "688235"}\n```', encoding="utf-8")

    assert not service.is_pending_import_feedback(object(), feedback)
    with pytest.raises(ValueError, match="趋势报告末尾的 JSON 必须是数组"):
        service.import_research_feedback(object(), feedback.id)


@pytest.mark.parametrize(
    "subject, researcher_code",
    [
        ("实盘组合", "portfolio_001"),
        ("实盘组合", "portfolio_002"),
        ("实盘组合（组合微操大师）", "portfolio_001"),
        ("实盘组合（组合趋势进攻师）", "portfolio_002"),
    ],
)
def test_portfolio_titles_preserve_identity_and_import_route(stored_feedback, monkeypatch, subject, researcher_code):
    feedback, path = stored_feedback
    feedback.title = f"{subject}-2026-11-12-微操报告"
    feedback.researcher_code = researcher_code
    payload = {"researcher_code": researcher_code, "items": []}
    path.write_text("```json\n" + json.dumps(payload) + "\n```", encoding="utf-8")
    importer = Mock(return_value={"target": "portfolio_adjust_advice"})
    monkeypatch.setattr(service, "_import_adjust_advice_feedback", importer)
    db = object()

    assert service.is_pending_import_feedback(db, feedback)
    assert service.import_research_feedback(db, feedback.id) == importer.return_value
    importer.assert_called_once_with(db, feedback, payload)
    assert feedback.researcher_code == researcher_code


@pytest.mark.parametrize(
    "code, name, title_template",
    [
        ("trend_001", "趋势投资者", "研究对象-YYYY-MM-DD-标的趋势研究"),
        ("portfolio_001", "组合微操大师", "实盘组合（组合微操大师）-YYYY-MM-DD-微操报告"),
        ("portfolio_002", "组合趋势进攻师", "实盘组合（组合趋势进攻师）-YYYY-MM-DD-微操报告"),
    ],
)
def test_profile_reader_exposes_current_title_contract(code, name, title_template):
    now = datetime(2026, 11, 13, tzinfo=timezone.utc)
    researcher = SimpleNamespace(
        id=1, researcher_code=code, display_name=name,
        profile_path=f"external/researchers/{code}/profile.md",
        profile_hash=None, status="active", created_at=now, updated_at=now,
    )
    db = Mock()
    db.scalar.return_value = researcher

    bundle = service.get_researcher_profile_bundle(db, code)

    assert title_template in bundle["method"]
    assert bundle["researcher_code"] == code
    assert bundle["display_name"] == name
    json_block = re.search(r"^```json\s*\n[\s\S]*?^```", bundle["method"], re.MULTILINE)
    assert json_block is not None
    payload = service._extract_trailing_json_payload(json_block.group(0))
    if code == "trend_001":
        assert isinstance(payload, list) and len(payload) == 1
        assert payload[0]["researcher_code"] == code
    else:
        assert payload["researcher_code"] == code
