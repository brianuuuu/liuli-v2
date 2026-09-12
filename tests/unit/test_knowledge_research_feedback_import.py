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
    delete_research_feedback,
    get_research_feedback,
    import_research_feedback,
)
from invest_assistant.modules.stock_analysis.models import StockValuationSnapshot
from invest_assistant.modules.stock_analysis.service import delete_score, list_trends
from invest_assistant.modules.track_discovery.models import Track


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


def valuation_markdown(**overrides) -> str:
    data = {
        "company": "万东医疗",
        "company_code": "600055",
        "report_period": "2026-Q1",
        "report_release_date": "2026-04-25",
        "current_market_value": 100.0,
        "financial_performance": {
            "beat_items": ["收入同比改善"],
            "inline_items": ["毛利率稳定"],
            "miss_items": ["经营现金流偏弱"],
        },
        "trend_reference": {
            "revenue_yoy": 12.3,
            "revenue_qoq": 4.5,
            "profit_yoy": 8.0,
            "profit_qoq": -2.0,
        },
        "guidance_check": {
            "has_guidance": False,
            "guidance_conflict": False,
            "note": "未发布单季指引",
        },
        "quarter_performance": "符合预期",
        "quarter_main_reason": "收入同比增速",
        "profit_model": {
            "growth_rate": 0.12,
            "target_multiple": 25,
            "market_value_3y": 140.0,
        },
        "fcf_model": {
            "growth_rate": 0.08,
            "target_multiple": 18,
            "market_value_3y": 110.0,
        },
        "revenue_model": {
            "growth_rate": 0.15,
            "target_multiple": 3.5,
            "market_value_3y": 150.0,
        },
        "primary_model": "revenue",
        "expected_market_value_3y": 150.0,
        "expectation_gap_rate": 999,
        "analysis_date": "2026-07-05",
        "researcher_code": "valuator_001",
    }
    data.update(overrides)
    import json

    return "# 万东医疗估值\n\n正文。\n\n```json\n" + json.dumps(data, ensure_ascii=False, indent=2) + "\n```\n"


def create_feedback(
    db: Session,
    title: str,
    markdown: str,
    *,
    researcher_code: str = "analyst_001",
    skill_name: str = "liuli-stock-rater",
) -> KnowledgeResearchFeedback:
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
            researcher_code=researcher_code,
            skill_name=skill_name,
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


def test_import_research_feedback_imports_stock_valuation_by_title(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    db.add(Stock(stock_code="600055", stock_name="万东医疗", symbol="600055.SH", exchange="SH"))
    db.commit()
    feedback = create_feedback(
        db,
        "万东医疗-2026-07-05-标的估值报告",
        valuation_markdown(),
        researcher_code="valuator_001",
        skill_name="liuli-stock-valuator",
    )

    result = import_research_feedback(db, feedback.id)

    assert result["target"] == "stock_valuation_snapshot"
    assert result["message"] == "估值导入成功"
    valuation = result["valuation"]
    assert valuation["stock_id"] == 1
    assert valuation["company"] == "万东医疗"
    assert valuation["company_code"] == "600055"
    assert valuation["report_period"] == "2026-Q1"
    assert valuation["report_release_date"] == date(2026, 4, 25)
    assert valuation["current_market_value"] == 100.0
    assert valuation["quarter_performance"] == "符合预期"
    assert valuation["quarter_main_reason"] == "收入同比增速"
    assert valuation["primary_model"] == "revenue"
    assert valuation["expected_market_value_3y"] == 150.0
    assert valuation["expectation_gap_rate"] == 0.5
    assert valuation["analysis_date"] == date(2026, 7, 5)
    assert valuation["researcher"] == "valuator_001"
    assert '"beat_items": ["收入同比改善"]' in valuation["financial_performance_json"]
    assert '"market_value_3y": 150.0' in valuation["revenue_model_json"]
    assert db.get(KnowledgeResearchFeedback, feedback.id).status == "parsed"
    assert db.query(StockValuationSnapshot).count() == 1


def test_import_research_feedback_rejects_valuation_error_json(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    feedback = create_feedback(
        db,
        "万东医疗-2026-07-05-标的估值报告",
        "# 万东医疗估值\n\n```json\n{\"error\": \"数据不足或财报周期无法确认\"}\n```\n",
        researcher_code="valuator_001",
        skill_name="liuli-stock-valuator",
    )

    with pytest.raises(ValueError, match="数据不足或财报周期无法确认"):
        import_research_feedback(db, feedback.id)


def test_import_research_feedback_rejects_non_numeric_valuation_company_code(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    db.add(Stock(stock_code="600055", stock_name="万东医疗", symbol="600055.SH", exchange="SH"))
    db.commit()
    feedback = create_feedback(
        db,
        "万东医疗-2026-07-05-标的估值报告",
        valuation_markdown(company_code="600055.SH"),
        researcher_code="valuator_001",
        skill_name="liuli-stock-valuator",
    )

    with pytest.raises(ValueError, match="company_code 必须为纯数字"):
        import_research_feedback(db, feedback.id)


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


def test_delete_research_feedback_removes_row_but_keeps_report():
    db = make_session()
    feedback = create_feedback(db, "万东医疗-2026-Q1-评级报告", score_markdown())
    feedback_id = feedback.id
    report_id = feedback.report_id
    assert report_id is not None

    deleted = delete_research_feedback(db, feedback)

    assert deleted.id == feedback_id
    assert get_research_feedback(db, feedback_id) is None
    # 报告是报告库的独立实体，删除回流记录不得连带删掉它
    assert report_service.get_report(db, report_id) is not None


def trend_item(**overrides) -> dict:
    data = {
        "company_code": "600055",
        "research_date": "2026-07-05",
        "market_data_date": "2026-07-04",
        "researcher_code": "trend_001",
        "main_track": "医疗影像",
        "trend_level": "T2",
        "track_short": "中",
        "track_mid": "中",
        "track_long": "强",
        "company_position": "核心受益",
        "market_recognition": "有辨识度，仍有分歧",
        "capital_recognition": "有启动，持续性待确认",
        "stock_stage": "修复",
        "mainline_cycle": "发酵",
        "remaining_upside": "基准 +4.9% 至 +7.6%，不利 -9.4% 至 -7.2%。",
        "trend_duration": "先看1-3个月。",
        "suggested_group": "candidate",
        "priority_rank": None,
        "core_logic": "平台突破后回踩修复，等待量价确认。",
        "primary_risk": "放量跌破平台上沿则修复逻辑弱化。",
        "next_verification": "未来1-2周观察承接与收复。",
        "data_gaps": "未取得既有T等级。",
    }
    data.update(overrides)
    return data


def trend_markdown(items: list[dict]) -> str:
    import json

    body = json.dumps(items, ensure_ascii=False, indent=2)
    return "# 趋势研究\n\n正文。\n\n```json\n" + body + "\n```\n"


def create_trend_feedback(db: Session, title: str, markdown: str) -> KnowledgeResearchFeedback:
    return create_feedback(db, title, markdown, researcher_code="analyst_001", skill_name="liuli-stock-trend")


def seed_stocks(db: Session) -> None:
    db.add(Stock(stock_code="600055", stock_name="万东医疗", symbol="600055.SH", exchange="SH"))
    db.add(Stock(stock_code="300866", stock_name="安克创新", symbol="300866.SZ", exchange="SZ"))
    db.commit()


def test_import_single_stock_trend_report(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    feedback = create_trend_feedback(db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item()]))

    result = import_research_feedback(db, feedback.id)

    assert result["target"] == "stock_trend_snapshot"
    # 单标的就是长度 1 的数组，提示与批量完全一致，没有特例分支
    assert result["message"] == "趋势导入完成：成功 1 个，失败 0 个"
    assert result["success_count"] == 1
    trend = result["trends"][0]
    assert trend["stock_id"] == 1
    assert trend["research_date"] == date(2026, 7, 5)
    assert trend["market_data_date"] == date(2026, 7, 4)
    assert trend["trend_level"] == "T2"
    assert trend["stock_stage"] == "修复"
    assert trend["mainline_cycle"] == "发酵"
    assert trend["track_short"] == "中"
    assert trend["capital_recognition"] == "有启动，持续性待确认"
    assert trend["suggested_group"] == "candidate"
    assert trend["priority_rank"] is None
    assert trend["report_id"] == feedback.report_id
    assert db.get(KnowledgeResearchFeedback, feedback.id).status == "parsed"


def test_import_pool_trend_report_writes_every_item(tmp_path, monkeypatch):
    """标的池报告和单标的报告走同一条路径，标题第一段只是标签。"""
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    items = [
        trend_item(priority_rank=1),
        trend_item(company_code="300866", trend_level="T1", main_track="消费电子", priority_rank=2),
    ]
    feedback = create_trend_feedback(db, "标的池-2026-07-05-趋势研究", trend_markdown(items))

    result = import_research_feedback(db, feedback.id)

    assert result["message"] == "趋势导入完成：成功 2 个，失败 0 个"
    assert [row["stock_id"] for row in result["trends"]] == [1, 2]
    assert [row["priority_rank"] for row in result["trends"]] == [1, 2]


def test_import_trend_report_prefers_stock_id_over_company_code(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    item = trend_item(stock_id=2, company_code="600055")
    feedback = create_trend_feedback(db, "AI算力-2026-07-05-趋势研究", trend_markdown([item]))

    result = import_research_feedback(db, feedback.id)

    assert result["trends"][0]["stock_id"] == 2


def test_import_trend_report_falls_back_to_company_code(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    feedback = create_trend_feedback(db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item()]))

    result = import_research_feedback(db, feedback.id)

    assert result["trends"][0]["stock_id"] == 1


def test_import_trend_report_resolves_track_by_name(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    db.add(Track(name="医疗影像"))
    db.commit()
    feedback = create_trend_feedback(db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item()]))

    trend = import_research_feedback(db, feedback.id)["trends"][0]

    assert trend["track_id"] == 1
    assert trend["main_track"] == "医疗影像"


def test_import_trend_report_keeps_track_text_when_name_unknown(tmp_path, monkeypatch):
    """赛道名匹配不上时只留文本，不报错也不新建赛道，研究判断不丢。"""
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    feedback = create_trend_feedback(db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item(main_track="没入库的赛道")]))

    trend = import_research_feedback(db, feedback.id)["trends"][0]

    assert trend["track_id"] is None
    assert trend["main_track"] == "没入库的赛道"


def test_import_trend_report_allows_multiple_snapshots_on_same_day(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    first = create_trend_feedback(db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item()]))
    import_research_feedback(db, first.id)
    second = create_trend_feedback(db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item(trend_level="T1")]))

    import_research_feedback(db, second.id)

    trends = list_trends(db, 1)
    assert len(trends) == 2
    assert {item.trend_level for item in trends} == {"T1", "T2"}


def test_import_trend_report_reports_partial_success(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    items = [
        trend_item(),
        trend_item(company_code="999999"),
        trend_item(company_code="300866", trend_level="T9"),
    ]
    feedback = create_trend_feedback(db, "标的池-2026-07-05-趋势研究", trend_markdown(items))

    result = import_research_feedback(db, feedback.id)

    assert result["message"] == "趋势导入完成：成功 1 个，失败 2 个"
    assert result["failures"][0]["stock"] == "999999"
    assert "未找到股票" in result["failures"][0]["error"]
    assert "trend_level 必须是" in result["failures"][1]["error"]
    # 部分成功即算成功，状态置 parsed，一键导入不会再重跑出重复记录
    assert db.get(KnowledgeResearchFeedback, feedback.id).status == "parsed"


def test_import_trend_report_fails_when_every_item_fails(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    items = [trend_item(company_code="999999"), trend_item(company_code="888888")]
    feedback = create_trend_feedback(db, "标的池-2026-07-05-趋势研究", trend_markdown(items))

    with pytest.raises(ValueError, match="趋势报告全部导入失败"):
        import_research_feedback(db, feedback.id)


def test_import_trend_report_rejects_object_payload(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    import json

    markdown = "# 趋势研究\n\n正文。\n\n```json\n" + json.dumps(trend_item(), ensure_ascii=False) + "\n```\n"
    feedback = create_trend_feedback(db, "万东医疗-2026-07-05-趋势研究", markdown)

    with pytest.raises(ValueError, match="趋势报告末尾的 JSON 必须是数组"):
        import_research_feedback(db, feedback.id)


def test_import_trend_report_rejects_research_date_mismatch(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    feedback = create_trend_feedback(
        db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item(research_date="2026-07-06")])
    )

    with pytest.raises(ValueError, match="趋势报告全部导入失败"):
        import_research_feedback(db, feedback.id)


def test_import_trend_report_accepts_minimal_item(tmp_path, monkeypatch):
    """只给标的身份、研究日期和等级也能导入，其余字段按 null 落库。"""
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    minimal = {"company_code": "600055", "research_date": "2026-07-05", "trend_level": "T3"}
    feedback = create_trend_feedback(db, "万东医疗-2026-07-05-趋势研究", trend_markdown([minimal]))

    trend = import_research_feedback(db, feedback.id)["trends"][0]

    assert trend["trend_level"] == "T3"
    assert trend["main_track"] is None
    assert trend["track_id"] is None
    assert trend["suggested_group"] is None
    assert trend["core_logic"] is None
    # researcher_code 缺失时回落到回流记录上的研究员
    assert trend["researcher_code"] == "analyst_001"


def test_import_trend_report_accepts_long_recognition_text(tmp_path, monkeypatch):
    """市场/资金认可度是带证据的判断描述，真实报告写到百字以上，必须整条落库不截断。"""
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    long_text = "9月1日成交约113.6万手，短期结构突破8月平台；随后两日缩量回踩，未跌破MA20，量能仍高于20日均量。" * 2
    feedback = create_trend_feedback(
        db,
        "万东医疗-2026-07-05-趋势研究",
        trend_markdown([trend_item(market_recognition=long_text, capital_recognition=long_text)]),
    )

    result = import_research_feedback(db, feedback.id)

    assert result["success_count"] == 1
    assert result["trends"][0]["market_recognition"] == long_text
    assert result["trends"][0]["capital_recognition"] == long_text


def test_import_trend_report_reports_which_field_is_too_long(tmp_path, monkeypatch):
    """仍有长度上限的字段要在落库前报出字段名和字数，而不是让数据库抛一句英文。"""
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    feedback = create_trend_feedback(
        db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item(stock_stage="修复" * 20)])
    )

    with pytest.raises(ValueError, match="stock_stage 超长：40 字，上限 30 字"):
        import_research_feedback(db, feedback.id)


def test_import_trend_report_rejects_unknown_suggested_group(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed_stocks(db)
    feedback = create_trend_feedback(
        db, "万东医疗-2026-07-05-趋势研究", trend_markdown([trend_item(suggested_group="hold")])
    )

    with pytest.raises(ValueError, match="趋势报告全部导入失败"):
        import_research_feedback(db, feedback.id)
