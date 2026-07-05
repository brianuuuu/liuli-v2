from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.report_library import service as report_service
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.models import KnowledgeResearchFeedback
from invest_assistant.modules.knowledge_base.schemas import KnowledgeResearchFeedbackCreate
from invest_assistant.modules.knowledge_base.service import (
    create_research_feedback,
    import_research_feedback,
)
from invest_assistant.modules.stock_analysis.service import delete_score


def make_session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    import invest_assistant.modules.basic.auth.models  # noqa: F401
    import invest_assistant.modules.basic.ai_audit.models  # noqa: F401
    import invest_assistant.modules.basic.disclosure_library.models  # noqa: F401
    import invest_assistant.modules.basic.job_center.models  # noqa: F401
    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.basic.system_config.models  # noqa: F401
    import invest_assistant.modules.alert_center.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.market_radar.models  # noqa: F401
    import invest_assistant.modules.portfolio.models  # noqa: F401
    import invest_assistant.modules.stock_analysis.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def score_markdown(**overrides) -> str:
    data = {
        "company_code": "600055",
        "company_name": "万东医疗",
        "latest_report_period": "2026-Q1",
        "business_moat_score": 6.4,
        "management_score": 5.3,
        "governance_score": 6.6,
        "strategy_score": 6.2,
        "certainty_score": 5.0,
        "growth_score": 6.0,
        "total_score": 6.0,
        "valuation_model": "PS/PB",
        "valuation_method_description": "TTM亏损导致PE不可用。",
        "current_reasonable_market_cap": "50b-95b",
        "investment_level": "C",
        "growth": True,
        "certainty": False,
        "core_logic": "产品处于修复期。",
        "primary_risk": "盈利修复不及预期。",
        "researcher_code": "analyst_001",
    }
    data.update(overrides)
    import json

    return "# 万东医疗评级\n\n正文。\n\n```json\n" + json.dumps(data, ensure_ascii=False, indent=2) + "\n```\n"


def create_feedback(db: Session, title: str, markdown: str) -> KnowledgeResearchFeedback:
    report, _size = report_service.create_markdown_report_file_and_index(
        db,
        title=title,
        source_module="stock_analysis",
        markdown=markdown,
    )
    return create_research_feedback(
        db,
        KnowledgeResearchFeedbackCreate(
            title=title,
            report_id=report.id,
            report_path=report.file_path,
            researcher_code="analyst_001",
            skill_name="liuli-stock-rater",
            business_module="stock_analysis",
            source="mcp",
            status="received",
        ),
    )


def test_import_research_feedback_imports_stock_score_by_title(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    db.add(Stock(stock_code="600055", stock_name="万东医疗", symbol="600055.SH", exchange="SH"))
    db.commit()
    feedback = create_feedback(db, "万东医疗-2026-07-05-标的评级报告", score_markdown())

    result = import_research_feedback(db, feedback.id)

    assert result["target"] == "stock_score_snapshot"
    assert result["message"] == "评分导入成功"
    score = result["score"]
    assert score["stock_id"] == 1
    assert score["report_time"] == date(2026, 7, 5)
    assert score["researcher_code"] == "analyst_001"
    assert score["business_moat_score"] == 6.4
    assert score["management_score"] == 5.3
    assert score["governance_score"] == 6.6
    assert score["strategy_score"] == 6.2
    assert score["certainty_score"] == 5.0
    assert score["growth_score"] == 6.0
    assert score["total_score"] == 6.0
    assert score["investment_level"] == "C"
    assert score["core_logic"] == "产品处于修复期。"
    assert score["primary_risk"] == "盈利修复不及预期。"
    assert db.get(KnowledgeResearchFeedback, feedback.id).status == "parsed"


def test_import_research_feedback_rejects_unknown_report_type(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    feedback = create_feedback(db, "万东医疗-2026-07-05-观察报告", score_markdown())

    with pytest.raises(ValueError, match="未识别可导入的报告类型"):
        import_research_feedback(db, feedback.id)


def test_import_research_feedback_validates_required_json(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    db.add(Stock(stock_code="600055", stock_name="万东医疗", symbol="600055.SH", exchange="SH"))
    db.commit()
    feedback = create_feedback(db, "万东医疗-2026-07-05-标的评级报告", score_markdown(company_code=""))

    with pytest.raises(ValueError, match="company_code"):
        import_research_feedback(db, feedback.id)


def test_import_research_feedback_rejects_missing_stock(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    feedback = create_feedback(db, "万东医疗-2026-07-05-标的评级报告", score_markdown())

    with pytest.raises(ValueError, match="未找到股票"):
        import_research_feedback(db, feedback.id)


def test_delete_score_removes_snapshot():
    db = make_session()
    db.add(Stock(stock_code="600055", stock_name="万东医疗", symbol="600055.SH", exchange="SH"))
    db.commit()
    from invest_assistant.modules.stock_analysis.schemas import StockScoreSnapshotCreate
    from invest_assistant.modules.stock_analysis.service import create_score, list_scores

    created = create_score(
        db,
        1,
        StockScoreSnapshotCreate(
            report_time=date(2026, 7, 5),
            researcher_code="analyst_001",
            business_moat_score=6.4,
            management_score=5.3,
            governance_score=6.6,
            strategy_score=6.2,
            certainty_score=5.0,
            growth_score=6.0,
            total_score=6.0,
            investment_level="C",
            core_logic="产品处于修复期。",
            primary_risk="盈利修复不及预期。",
        ),
    )

    assert delete_score(db, created.id) is True
    assert list_scores(db, 1) == []
