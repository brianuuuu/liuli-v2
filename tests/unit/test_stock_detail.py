from datetime import date, datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.disclosure_library.service import disclosure_to_stock_analysis
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.market_radar.models import SourceItem, StockTagRelation, Tag
from invest_assistant.modules.stock_analysis.models import (
    StockMaterial,
    StockPoolItem,
    StockResearchNote,
    StockScoreSnapshot,
    StockTrackRelation,
    StockValuationSnapshot,
)
from invest_assistant.modules.stock_analysis.service import get_stock_detail
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


def test_stock_detail_returns_none_for_missing_stock():
    db = make_session()

    assert get_stock_detail(db, 404) is None


def test_stock_detail_aggregates_current_stock_research_data():
    db = make_session()
    stock = Stock(stock_code="000333", stock_name="美的集团", symbol="000333.SZ", exchange="SZ")
    track = Track(name="智能家电", status="active")
    tag = Tag(name="白电龙头", type="stock", source="manual", status="active")
    db.add_all([stock, track, tag])
    db.flush()
    db.add_all(
        [
            StockPoolItem(stock_id=stock.id, status="focused", source="manual", reason="现金流稳定"),
            StockTrackRelation(stock_id=stock.id, track_id=track.id, relation_type="core", conviction=0.8, status="active"),
            StockTagRelation(stock_id=stock.id, tag_id=tag.id, source="manual", status="active"),
            StockScoreSnapshot(stock_id=stock.id, report_time=date(2026, 5, 1), total_score=7.0, growth_score=6.0),
            StockScoreSnapshot(stock_id=stock.id, report_time=date(2026, 5, 31), total_score=8.6, growth_score=8.0, investment_level="A"),
            StockValuationSnapshot(
                stock_id=stock.id,
                report_period="2025A",
                current_market_value=4200,
                expected_market_value_3y=5000,
                expectation_gap_rate=0.19,
                analysis_date=date(2026, 5, 20),
                primary_model="fcf",
                researcher="analyst",
            ),
            StockValuationSnapshot(
                stock_id=stock.id,
                report_period="2026Q1",
                current_market_value=4500,
                expected_market_value_3y=5400,
                expectation_gap_rate=0.2,
                analysis_date=date(2026, 5, 31),
                primary_model="profit",
                researcher="analyst",
            ),
            StockResearchNote(
                stock_id=stock.id,
                note_type="thesis",
                title="份额提升",
                content="空调和海外业务份额继续提升。",
                related_track_id=track.id,
            ),
        ]
    )
    source = SourceItem(
        source_type="news",
        source_name="manual",
        title="美的集团海外业务增长",
        content="海外业务增长，利润率改善。",
        publish_time=datetime(2026, 5, 31, 9, 30, tzinfo=timezone.utc),
    )
    db.add(source)
    db.flush()
    db.add(
        StockMaterial(
            stock_id=stock.id,
            material_type="source_item",
            material_id=source.id,
            impact_direction="positive",
            importance_level="high",
            status="confirmed",
            note="验证海外逻辑",
        )
    )
    db.commit()

    detail = get_stock_detail(db, stock.id)

    assert detail["stock"]["stock_name"] == "美的集团"
    assert detail["pool"]["status"] == "focused"
    assert detail["latest_score"]["total_score"] == 8.6
    assert detail["latest_score"]["investment_level"] == "A"
    assert [item["report_time"] for item in detail["score_history"]] == [date(2026, 5, 1), date(2026, 5, 31)]
    assert detail["latest_valuation"]["report_period"] == "2026Q1"
    assert [item["report_period"] for item in detail["valuation_history"]] == ["2025A", "2026Q1"]
    assert detail["tracks"][0]["track"]["name"] == "智能家电"
    assert detail["tags"][0]["tag"]["name"] == "白电龙头"
    assert detail["notes"][0]["title"] == "份额提升"
    assert detail["materials"][0]["material_title"] == "美的集团海外业务增长"
    assert detail["summary"]["material_count"] == 1
    assert detail["summary"]["high_importance_material_count"] == 1


def test_stock_detail_materials_resolve_company_disclosure_metadata():
    db = make_session()
    stock = Stock(stock_code="000333", stock_name="美的集团", symbol="000333.SZ")
    db.add(stock)
    db.flush()
    disclosure = CompanyDisclosure(
        stock_id=stock.id,
        source="cninfo",
        disclosure_type="annual_report",
        title="美的集团：2025年年度报告",
        publish_time=datetime(2026, 4, 30, 20, 0, tzinfo=timezone.utc),
        report_period="2025A",
        source_url="https://example.com/report.pdf",
        parse_status="parsed",
    )
    db.add(disclosure)
    db.flush()
    db.add(
        StockMaterial(
            stock_id=stock.id,
            material_type="company_disclosure",
            material_id=disclosure.id,
            impact_direction="neutral",
            importance_level="high",
            status="pending",
        )
    )
    db.commit()

    detail = get_stock_detail(db, stock.id)

    material = detail["materials"][0]
    assert material["material_type"] == "company_disclosure"
    assert material["material_title"] == "美的集团：2025年年度报告"
    assert material["material_source_name"] == "cninfo"
    assert material["material_url"] == "https://example.com/report.pdf"
    assert material["disclosure_type"] == "annual_report"
    assert material["report_period"] == "2025A"
    assert material["parse_status"] == "parsed"
    assert detail["disclosures"][0]["title"] == "美的集团：2025年年度报告"


def test_stock_detail_materials_are_sorted_by_material_time_desc():
    db = make_session()
    stock = Stock(stock_code="000333", stock_name="美的集团", symbol="000333.SZ")
    db.add(stock)
    db.flush()
    newer = SourceItem(
        source_type="news",
        source_name="manual",
        title="较新的材料",
        content="newer",
        publish_time=datetime(2026, 3, 26, tzinfo=timezone.utc),
    )
    older = SourceItem(
        source_type="news",
        source_name="manual",
        title="较旧的材料",
        content="older",
        publish_time=datetime(2026, 3, 10, tzinfo=timezone.utc),
    )
    db.add_all([newer, older])
    db.flush()
    db.add_all(
        [
            StockMaterial(stock_id=stock.id, material_type="source_item", material_id=newer.id, status="pending"),
            StockMaterial(stock_id=stock.id, material_type="source_item", material_id=older.id, status="pending"),
        ]
    )
    db.commit()

    detail = get_stock_detail(db, stock.id)

    assert [item["material_title"] for item in detail["materials"]] == ["较新的材料", "较旧的材料"]


def test_disclosure_to_stock_analysis_requires_stock_id():
    db = make_session()
    disclosure = CompanyDisclosure(
        source="cninfo",
        disclosure_type="announcement",
        title="未绑定标的公告",
        publish_time=datetime(2026, 5, 31, tzinfo=timezone.utc),
    )
    db.add(disclosure)
    db.commit()

    with pytest.raises(ValueError, match="stock_id is required"):
        disclosure_to_stock_analysis(db, disclosure)
