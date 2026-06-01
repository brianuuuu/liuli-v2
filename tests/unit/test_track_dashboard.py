from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.models import KnowledgeNote
from invest_assistant.modules.market_radar.models import SourceItem, SourceTag, Tag, TagHeatSnapshot, TrackTagRelation
from invest_assistant.modules.market_radar.service import WINDOWS, aggregate_heat
from invest_assistant.modules.stock_analysis.models import StockTrackRelation
from invest_assistant.modules.track_discovery.models import Track, TrackAnalysisSnapshot, TrackMaterial
from invest_assistant.modules.track_discovery.service import get_dashboard


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


def add_heat(db: Session, tag_id: int, window: str, stat_time: datetime, heat_score: float, rank_no: int = 1, change_ratio: float = 0) -> None:
    db.add(
        TagHeatSnapshot(
            tag_id=tag_id,
            window_type=window,
            stat_time=stat_time,
            trigger_count=int(heat_score),
            source_count=1,
            heat_score=heat_score,
            avg_count=heat_score,
            change_ratio=change_ratio,
            rank_no=rank_no,
        )
    )


def test_track_dashboard_aggregates_heat_materials_relations_and_analysis():
    db = make_session()
    now = datetime(2026, 5, 31, 9, 30, tzinfo=timezone.utc)
    robot = Track(name="机器人", status="active", track_score=86, current_view="订单兑现预期提升", stage="growth", confidence_level="high")
    ai = Track(name="AI算力", status="active", track_score=82, current_view="需求侧持续验证", stage="validate", confidence_level="medium")
    db.add_all([robot, ai])
    db.flush()
    robot_tag_a = Tag(name="机器人", type="track", status="active")
    robot_tag_b = Tag(name="执行器", type="track", status="active")
    ai_tag = Tag(name="AI算力", type="track", status="active")
    db.add_all([robot_tag_a, robot_tag_b, ai_tag])
    db.flush()
    db.add_all(
        [
            TrackTagRelation(track_id=robot.id, tag_id=robot_tag_a.id, status="active"),
            TrackTagRelation(track_id=robot.id, tag_id=robot_tag_b.id, status="active"),
            TrackTagRelation(track_id=ai.id, tag_id=ai_tag.id, status="active"),
        ]
    )
    add_heat(db, robot_tag_a.id, "24h", now, 60, 1)
    add_heat(db, robot_tag_b.id, "24h", now, 29, 2)
    add_heat(db, ai_tag.id, "24h", now, 84, 3)
    add_heat(db, robot_tag_a.id, "7d", now - timedelta(days=1), 62, 1)
    add_heat(db, robot_tag_b.id, "7d", now - timedelta(days=1), 10, 2)
    add_heat(db, robot_tag_a.id, "7d", now, 70, 1, 0.12)
    add_heat(db, robot_tag_b.id, "7d", now, 14, 2, 0.4)
    add_heat(db, robot_tag_a.id, "30d", now, 80, 1, 0.08)
    add_heat(db, robot_tag_a.id, "90d", now, 90, 1, 0.2)
    add_heat(db, ai_tag.id, "7d", now, 77, 3, 0.02)
    source = SourceItem(source_type="news", source_name="manual", title="机器人订单提升", content="机器人订单和执行器关注度提升", publish_time=now)
    note = KnowledgeNote(title="AI算力复盘", content="算力需求仍需要持续跟踪", note_type="review")
    stock = Stock(stock_code="000001", stock_name="测试标的")
    db.add_all([source, note, stock])
    db.flush()
    db.add_all(
        [
            TrackMaterial(track_id=robot.id, material_type="source_item", material_id=source.id, direction="support", importance_level="high", status="pending"),
            TrackMaterial(track_id=ai.id, material_type="knowledge_note", material_id=note.id, direction="neutral", importance_level="medium", status="confirmed"),
            StockTrackRelation(stock_id=stock.id, track_id=robot.id, conviction=80, status="active"),
            TrackAnalysisSnapshot(
                track_id=robot.id,
                analysis_date=date(2026, 5, 31),
                market_space="长期空间大",
                market_size="放量早期",
                growth_rate="加速",
                heat_summary="执行器链条升温",
                opportunity_points="订单兑现",
                risk_points="估值过热",
                watch_signals="订单、核心零部件",
                score=88,
                confidence_level="high",
            ),
        ]
    )
    db.commit()

    dashboard = get_dashboard(db)

    assert dashboard["summary"]["warming_tracks_count"] == 2
    assert dashboard["summary"]["focus_tracks_count"] == 2
    assert dashboard["summary"]["pending_materials_count"] == 1
    assert dashboard["summary"]["top_heat_track"]["name"] == "机器人"
    assert dashboard["summary"]["top_heat_track"]["heat_score"] == 89
    assert dashboard["heat_rankings"][0]["track_name"] == "机器人"
    assert dashboard["heat_rankings"][0]["current_heat"] == 89
    assert dashboard["heat_rankings"][0]["change_7d"] == 0.52
    assert dashboard["heat_rankings"][0]["change_30d"] == 0.08
    assert dashboard["heat_rankings"][0]["change_90d"] == 0.2
    assert dashboard["focus_tracks"][0]["bound_stock_count"] == 1
    assert dashboard["focus_tracks"][0]["recent_material_count"] == 1
    assert dashboard["latest_materials"][0]["track_name"] == "机器人"
    assert dashboard["latest_materials"][0]["material_type"] == "source_item"
    assert dashboard["analysis_summary"]["track_name"] == "机器人"
    assert dashboard["analysis_summary"]["market_space"] == "长期空间大"
    assert any(point["window_type"] == "90d" for trend in dashboard["heat_trends"] for point in trend["points"])


def test_aggregate_heat_supports_90d_and_preserves_previous_stat_times():
    db = make_session()
    old_time = datetime(2026, 5, 30, 9, 0, tzinfo=timezone.utc)
    new_time = datetime(2026, 5, 31, 9, 0, tzinfo=timezone.utc)
    tag = Tag(name="机器人", type="track", status="active")
    db.add(tag)
    db.flush()
    db.add(TagHeatSnapshot(tag_id=tag.id, window_type="24h", stat_time=old_time, trigger_count=1, source_count=1, heat_score=11, avg_count=1, change_ratio=0, rank_no=1))
    old_source = SourceItem(source_type="news", source_name="manual", title="旧材料", content="机器人", publish_time=old_time)
    new_source = SourceItem(source_type="news", source_name="manual", title="新材料", content="机器人", publish_time=new_time)
    db.add_all([old_source, new_source])
    db.flush()
    db.add_all([SourceTag(source_item_id=old_source.id, tag_id=tag.id, confidence=1, extractor="test"), SourceTag(source_item_id=new_source.id, tag_id=tag.id, confidence=1, extractor="test")])
    db.commit()

    result = aggregate_heat(db)

    windows = {row.window_type for row in db.scalars(select(TagHeatSnapshot))}
    stat_times = {row.stat_time for row in db.scalars(select(TagHeatSnapshot).where(TagHeatSnapshot.window_type == "24h"))}
    assert "90d" in WINDOWS
    assert "90d" in windows
    assert old_time.replace(tzinfo=None) in stat_times
    assert new_time.replace(tzinfo=None) in stat_times
    assert result.inserted_count >= 4
