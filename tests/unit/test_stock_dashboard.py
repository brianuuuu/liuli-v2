from datetime import date, datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.stock_analysis.models import (
    StockMaterial,
    StockPoolItem,
    StockResearchNote,
    StockScoreSnapshot,
    StockTrackRelation,
    StockValuationSnapshot,
)
from invest_assistant.modules.stock_analysis.service import get_dashboard
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


def test_stock_dashboard_returns_stable_empty_shape():
    db = make_session()

    dashboard = get_dashboard(db)

    assert dashboard == {
        "summary": {
            "pool_count": 0,
            "focused_count": 0,
            "pending_materials_count": 0,
            "top_score_stock": None,
        },
        "score_trends": [],
        "valuation_trends": [],
        "score_rankings": [],
        "latest_valuations": [],
        "hot_stocks": [],
        "focus_stocks": [],
        "latest_materials": [],
        "pending_materials": [],
        "default_stock_id": None,
        "selected_stock_summary": None,
    }


def test_stock_dashboard_aggregates_pool_scores_materials_and_summary():
    db = make_session()
    now = datetime(2026, 5, 31, 9, 30, tzinfo=timezone.utc)
    robot_track = Track(name="机器人", status="active")
    ai_track = Track(name="AI算力", status="active")
    db.add_all([robot_track, ai_track])
    db.flush()

    focused_stock = Stock(stock_code="300001", stock_name="重点科技", symbol="300001.SZ")
    candidate_stock = Stock(stock_code="600001", stock_name="候选制造", symbol="600001.SH")
    watching_stock = Stock(stock_code="000001", stock_name="观察银行", symbol="000001.SZ")
    db.add_all([focused_stock, candidate_stock, watching_stock])
    db.flush()
    db.add_all(
        [
            StockPoolItem(stock_id=focused_stock.id, status="focused", source="manual", reason="机器人核心受益"),
            StockPoolItem(stock_id=candidate_stock.id, status="candidate", source="track_discovery", reason="赛道候选"),
            StockPoolItem(stock_id=watching_stock.id, status="watching", source="manual", reason="估值观察"),
            StockTrackRelation(stock_id=focused_stock.id, track_id=robot_track.id, conviction=88, status="active"),
            StockTrackRelation(stock_id=focused_stock.id, track_id=ai_track.id, conviction=55, status="active"),
        ]
    )
    db.flush()
    db.add_all(
        [
            StockScoreSnapshot(
                stock_id=focused_stock.id,
                score_date=date(2026, 5, 30),
                track_id=robot_track.id,
                growth_score=70,
                valuation_score=60,
                moat_score=75,
                risk_score=50,
                total_score=72,
            ),
            StockScoreSnapshot(
                stock_id=focused_stock.id,
                score_date=date(2026, 5, 31),
                track_id=robot_track.id,
                growth_score=91,
                valuation_score=82,
                moat_score=88,
                risk_score=40,
                total_score=90,
            ),
            StockScoreSnapshot(
                stock_id=candidate_stock.id,
                score_date=date(2026, 5, 31),
                growth_score=65,
                valuation_score=77,
                moat_score=61,
                risk_score=35,
                total_score=76,
            ),
            StockValuationSnapshot(
                stock_id=focused_stock.id,
                company="重点科技",
                report_period="2026Q1",
                current_market_value=1200,
                quarter_performance="收入加速",
                primary_model="profit",
                expected_market_value_3y=1800,
                expectation_gap_rate=0.5,
                analysis_date=date(2026, 5, 31),
                researcher="tester",
            ),
            StockResearchNote(
                stock_id=focused_stock.id,
                note_type="核心逻辑",
                title="机器人订单兑现",
                content="订单和核心部件交付进度持续改善",
                related_track_id=robot_track.id,
            ),
        ]
    )
    source = SourceItem(
        source_type="news",
        source_name="manual",
        title="重点科技签订机器人订单",
        content="重点科技机器人订单增长，核心客户扩张。",
        publish_time=now,
    )
    db.add(source)
    db.flush()
    db.add_all(
        [
            StockMaterial(
                stock_id=focused_stock.id,
                material_type="source_item",
                material_id=source.id,
                impact_direction="positive",
                importance_level="high",
                status="pending",
                note="订单验证加强",
            ),
            StockMaterial(
                stock_id=focused_stock.id,
                material_type="knowledge_note",
                material_id=1,
                impact_direction="neutral",
                importance_level="medium",
                status="confirmed",
            ),
        ]
    )
    db.commit()

    dashboard = get_dashboard(db)

    assert dashboard["summary"]["pool_count"] == 3
    assert dashboard["summary"]["focused_count"] == 1
    assert dashboard["summary"]["pending_materials_count"] == 1
    assert dashboard["summary"]["top_score_stock"] == {
        "stock_id": focused_stock.id,
        "stock_name": "重点科技",
        "stock_code": "300001",
        "total_score": 90,
    }
    assert dashboard["default_stock_id"] == focused_stock.id
    assert dashboard["score_rankings"][0]["stock_id"] == focused_stock.id
    assert dashboard["score_rankings"][0]["total_score"] == 90
    assert dashboard["score_rankings"][0]["tracks"][0]["name"] == "AI算力"
    assert dashboard["score_rankings"][0]["tracks"][1]["name"] == "机器人"
    assert dashboard["focus_stocks"][0]["stock_id"] == focused_stock.id
    assert dashboard["focus_stocks"][0]["bound_track_count"] == 2
    assert dashboard["focus_stocks"][0]["recent_material_count"] == 2
    assert dashboard["pending_materials"][0]["stock_name"] == "重点科技"
    assert dashboard["pending_materials"][0]["impact_direction"] == "positive"
    assert dashboard["latest_materials"][0]["material_title"] == "重点科技签订机器人订单"
    assert dashboard["selected_stock_summary"]["stock_name"] == "重点科技"
    assert dashboard["selected_stock_summary"]["latest_score"]["total_score"] == 90
    assert dashboard["selected_stock_summary"]["latest_valuation"]["expectation_gap_rate"] == 0.5
    assert dashboard["selected_stock_summary"]["latest_note"]["title"] == "机器人订单兑现"
    assert len(dashboard["score_trends"][0]["points"]) == 2
    assert dashboard["latest_valuations"][0]["stock_id"] == focused_stock.id
    assert dashboard["latest_valuations"][0]["report_period"] == "2026Q1"
    assert dashboard["latest_valuations"][0]["expectation_gap_rate"] == 0.5
    assert dashboard["valuation_trends"][0]["stock_id"] == focused_stock.id
    assert dashboard["valuation_trends"][0]["points"][0]["expected_market_value_3y"] == 1800


def test_stock_dashboard_uses_latest_valuation_per_stock_and_builds_trends():
    db = make_session()
    first = Stock(stock_code="300001", stock_name="重点科技", symbol="300001.SZ")
    second = Stock(stock_code="600001", stock_name="候选制造", symbol="600001.SH")
    db.add_all([first, second])
    db.flush()
    db.add_all(
        [
            StockPoolItem(stock_id=first.id, status="focused", source="manual"),
            StockPoolItem(stock_id=second.id, status="watching", source="manual"),
            StockScoreSnapshot(stock_id=first.id, score_date=date(2026, 5, 31), total_score=80),
            StockScoreSnapshot(stock_id=second.id, score_date=date(2026, 5, 31), total_score=78),
            StockValuationSnapshot(
                stock_id=first.id,
                report_period="2025Q4",
                current_market_value=900,
                expected_market_value_3y=1200,
                expectation_gap_rate=0.2,
                analysis_date=date(2026, 5, 1),
            ),
            StockValuationSnapshot(
                stock_id=first.id,
                report_period="2026Q1",
                current_market_value=1000,
                expected_market_value_3y=1600,
                expectation_gap_rate=0.6,
                analysis_date=date(2026, 5, 31),
            ),
            StockValuationSnapshot(
                stock_id=second.id,
                report_period="2026Q1",
                current_market_value=800,
                expected_market_value_3y=960,
                expectation_gap_rate=0.2,
                analysis_date=date(2026, 5, 31),
            ),
        ]
    )
    db.commit()

    dashboard = get_dashboard(db)

    assert dashboard["latest_valuations"][0]["stock_id"] == first.id
    assert dashboard["latest_valuations"][0]["report_period"] == "2026Q1"
    assert dashboard["latest_valuations"][0]["expected_market_value_3y"] == 1600
    assert dashboard["latest_valuations"][1]["stock_id"] == second.id
    first_trend = next(item for item in dashboard["valuation_trends"] if item["stock_id"] == first.id)
    assert [point["analysis_date"] for point in first_trend["points"]] == [date(2026, 5, 1), date(2026, 5, 31)]
    assert [point["expectation_gap_rate"] for point in first_trend["points"]] == [0.2, 0.6]


def test_stock_dashboard_selected_summary_returns_latest_10_materials():
    db = make_session()
    stock = Stock(stock_code="300001", stock_name="重点科技", symbol="300001.SZ")
    db.add(stock)
    db.flush()
    db.add(StockPoolItem(stock_id=stock.id, status="focused", source="manual"))
    db.add(
        StockScoreSnapshot(
            stock_id=stock.id,
            score_date=date(2026, 5, 31),
            growth_score=80,
            valuation_score=70,
            moat_score=75,
            risk_score=35,
            total_score=82,
        )
    )
    db.flush()
    for index in range(12):
        source = SourceItem(
            source_type="news",
            source_name="manual",
            title=f"材料 {index}",
            content=f"材料 {index} 摘要",
            publish_time=datetime(2026, 5, 31, 9, index, tzinfo=timezone.utc),
        )
        db.add(source)
        db.flush()
        db.add(
            StockMaterial(
                stock_id=stock.id,
                material_type="source_item",
                material_id=source.id,
                impact_direction="positive",
                importance_level="medium",
                status="confirmed",
            )
        )
    db.commit()

    dashboard = get_dashboard(db)

    recent = dashboard["selected_stock_summary"]["recent_materials"]
    assert len(recent) == 10
    assert recent[0]["material_title"] == "材料 11"
    assert recent[-1]["material_title"] == "材料 2"


def test_stock_dashboard_ranks_hot_stocks_by_material_activity():
    db = make_session()
    base_time = datetime(2026, 5, 31, 9, 0)
    first = Stock(stock_code="300001", stock_name="材料科技", symbol="300001.SZ")
    second = Stock(stock_code="600001", stock_name="信息制造", symbol="600001.SH")
    quiet = Stock(stock_code="000001", stock_name="安静银行", symbol="000001.SZ")
    db.add_all([first, second, quiet])
    db.flush()
    db.add_all(
        [
            StockPoolItem(stock_id=first.id, status="focused", source="manual"),
            StockPoolItem(stock_id=second.id, status="candidate", source="manual"),
            StockPoolItem(stock_id=quiet.id, status="watching", source="manual"),
        ]
    )
    db.flush()

    def add_source_material(stock_id: int, index: int, importance: str = "medium") -> None:
        source = SourceItem(
            source_type="news",
            source_name="manual",
            title=f"信息流 {index}",
            content=f"信息流 {index} 摘要",
            publish_time=base_time.replace(minute=index),
        )
        db.add(source)
        db.flush()
        db.add(
            StockMaterial(
                stock_id=stock_id,
                material_type="source_item",
                material_id=source.id,
                impact_direction="positive",
                importance_level=importance,
                status="confirmed",
                created_at=base_time.replace(minute=index),
                updated_at=base_time.replace(minute=index),
            )
        )

    add_source_material(first.id, 1, "high")
    add_source_material(first.id, 2, "medium")
    add_source_material(second.id, 3, "high")
    add_source_material(second.id, 4, "high")
    add_source_material(second.id, 5, "medium")
    db.add(
        StockMaterial(
            stock_id=first.id,
            material_type="knowledge_note",
            material_id=101,
            importance_level="high",
            status="confirmed",
            created_at=base_time.replace(minute=6),
            updated_at=base_time.replace(minute=6),
        )
    )
    db.commit()

    dashboard = get_dashboard(db)

    assert [row["stock_id"] for row in dashboard["hot_stocks"]] == [second.id, first.id]
    assert dashboard["hot_stocks"][0] == {
        "rank": 1,
        "stock_id": second.id,
        "stock_name": "信息制造",
        "stock_code": "600001",
        "status": "candidate",
        "source_item_count": 3,
        "material_count": 3,
        "high_importance_material_count": 2,
        "latest_material_time": base_time.replace(minute=5),
    }
    assert dashboard["hot_stocks"][1]["source_item_count"] == 2
    assert dashboard["hot_stocks"][1]["material_count"] == 3
