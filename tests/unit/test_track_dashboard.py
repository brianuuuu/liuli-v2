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


def add_heat(db: Session, tag_id: int, window: str, stat_time: datetime, heat_score: float, rank_no: int = 1) -> None:
    db.add(
        TagHeatSnapshot(
            tag_id=tag_id,
            window_type=window,
            stat_time=stat_time,
            trigger_count=int(heat_score),
            source_count=1,
            heat_score=heat_score,
            avg_count=heat_score,
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
    add_heat(db, robot_tag_a.id, "7d", now, 70, 1)
    add_heat(db, robot_tag_b.id, "7d", now, 14, 2)
    add_heat(db, robot_tag_a.id, "30d", now, 80, 1)
    add_heat(db, ai_tag.id, "7d", now, 77, 3)
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

    assert dashboard["summary"]["warming_tracks_count"] == 0
    assert dashboard["summary"]["focus_tracks_count"] == 2
    assert dashboard["summary"]["pending_materials_count"] == 1
    assert dashboard["summary"]["top_heat_track"]["name"] == "机器人"
    assert dashboard["summary"]["top_heat_track"]["heat_score"] == 89
    assert dashboard["heat_rankings"][0]["track_name"] == "机器人"
    assert dashboard["heat_rankings"][0]["current_heat"] == 89
    assert dashboard["heat_rankings"][0]["rank_change_24h"] is None
    assert dashboard["heat_rankings"][0]["rank_change_7d"] == 0
    assert dashboard["heat_rankings"][0]["rank_change_30d"] is None
    assert dashboard["focus_tracks"][0]["bound_stock_count"] == 1
    assert dashboard["focus_tracks"][0]["recent_material_count"] == 1
    assert dashboard["latest_materials"][0]["track_name"] == "机器人"
    assert dashboard["latest_materials"][0]["material_type"] == "source_item"
    assert dashboard["analysis_summary"]["track_name"] == "机器人"
    assert dashboard["analysis_summary"]["market_space"] == "长期空间大"
    assert {point["window_type"] for trend in dashboard["heat_trends"] for point in trend["points"]} <= {"7d", "30d"}


def test_track_dashboard_trends_sum_track_tags_per_track_window_before_limiting():
    db = make_session()
    base_time = datetime(2026, 6, 1, 9, 0)
    target = Track(name="具身智能", status="active", track_score=90)
    noisy = Track(name="噪声赛道", status="active", track_score=10)
    db.add_all([target, noisy])
    db.flush()
    target_tag_a = Tag(name="具身智能", type="track", status="active")
    target_tag_b = Tag(name="机器人本体", type="track", status="active")
    noisy_tag = Tag(name="噪声标签", type="track", status="active")
    db.add_all([target_tag_a, target_tag_b, noisy_tag])
    db.flush()
    db.add_all(
        [
            TrackTagRelation(track_id=target.id, tag_id=target_tag_a.id, status="active"),
            TrackTagRelation(track_id=target.id, tag_id=target_tag_b.id, status="active"),
            TrackTagRelation(track_id=noisy.id, tag_id=noisy_tag.id, status="active"),
        ]
    )
    for offset, score in enumerate((10, 20, 30)):
        stat_time = base_time + timedelta(days=offset)
        add_heat(db, target_tag_a.id, "7d", stat_time, score)
        add_heat(db, target_tag_b.id, "7d", stat_time, score + 1)
    add_heat(db, target_tag_a.id, "24h", base_time + timedelta(days=2), 100)
    add_heat(db, target_tag_b.id, "24h", base_time + timedelta(days=2), 50)
    for offset in range(40):
        add_heat(db, noisy_tag.id, "7d", base_time + timedelta(days=10, minutes=offset), 1)
    add_heat(db, noisy_tag.id, "24h", base_time + timedelta(days=10), 1)
    db.commit()

    dashboard = get_dashboard(db)

    target_trend = next(item for item in dashboard["heat_trends"] if item["track_id"] == target.id)
    points_7d = [point for point in target_trend["points"] if point["window_type"] == "7d"]
    assert [point["heat_score"] for point in points_7d] == [21, 41, 61]


def test_track_dashboard_warming_summary_uses_7d_rank_change_by_default():
    db = make_session()
    now = datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc)
    track = Track(name="机器人", status="active", track_score=80)
    other_track = Track(name="AI算力", status="active", track_score=70)
    tag = Tag(name="机器人", type="track", status="active")
    other_tag = Tag(name="AI算力", type="track", status="active")
    db.add_all([track, other_track, tag, other_tag])
    db.flush()
    db.add_all(
        [
            TrackTagRelation(track_id=track.id, tag_id=tag.id, status="active"),
            TrackTagRelation(track_id=other_track.id, tag_id=other_tag.id, status="active"),
        ]
    )
    add_heat(db, tag.id, "24h", now - timedelta(hours=1), 8, 2)
    add_heat(db, other_tag.id, "24h", now - timedelta(hours=1), 12, 1)
    add_heat(db, tag.id, "24h", now, 10, 1)
    add_heat(db, other_tag.id, "24h", now, 6, 2)
    add_heat(db, tag.id, "7d", now - timedelta(days=1), 9, 1)
    add_heat(db, other_tag.id, "7d", now - timedelta(days=1), 5, 2)
    add_heat(db, tag.id, "7d", now, 10, 1)
    add_heat(db, other_tag.id, "7d", now, 4, 2)
    db.commit()

    dashboard = get_dashboard(db)

    assert dashboard["heat_rankings"][0]["rank_change_24h"] == 1
    assert dashboard["heat_rankings"][0]["rank_change_7d"] == 0
    assert dashboard["summary"]["warming_tracks_count"] == 0


def test_aggregate_heat_uses_tag_hit_count_and_supported_windows():
    db = make_session()
    old_time = datetime(2026, 5, 30, 9, 0, tzinfo=timezone.utc)
    new_time = datetime(2026, 5, 31, 9, 0, tzinfo=timezone.utc)
    tag = Tag(name="机器人", type="track", status="active")
    competitor_a = Tag(name="AI算力", type="track", status="active")
    competitor_b = Tag(name="商业航天", type="track", status="active")
    db.add_all([tag, competitor_a, competitor_b])
    db.flush()
    db.add(TagHeatSnapshot(tag_id=tag.id, window_type="24h", stat_time=old_time, trigger_count=1, source_count=1, heat_score=1, avg_count=1, rank_no=1))
    old_source = SourceItem(source_type="news", source_name="manual", title="旧材料", content="机器人", publish_time=old_time)
    new_source = SourceItem(source_type="news", source_name="manual", title="新材料", content="机器人", publish_time=new_time)
    db.add_all([old_source, new_source])
    db.flush()
    db.add_all([SourceTag(source_item_id=old_source.id, tag_id=tag.id, confidence=1, extractor="test"), SourceTag(source_item_id=new_source.id, tag_id=tag.id, confidence=1, extractor="test")])
    db.commit()

    result = aggregate_heat(db)

    windows = {row.window_type for row in db.scalars(select(TagHeatSnapshot))}
    stat_times = {row.stat_time for row in db.scalars(select(TagHeatSnapshot).where(TagHeatSnapshot.window_type == "24h"))}
    assert set(WINDOWS) == {"24h", "7d", "30d"}
    assert windows <= {"24h", "7d", "30d"}
    assert old_time.replace(tzinfo=None) in stat_times
    assert new_time.replace(tzinfo=None) in stat_times
    latest = db.scalar(
        select(TagHeatSnapshot).where(
            TagHeatSnapshot.window_type == "24h",
            TagHeatSnapshot.stat_time == new_time.replace(tzinfo=None),
        )
    )
    assert latest is not None
    assert latest.heat_score == latest.trigger_count
    assert result.inserted_count >= 3


def test_latest_rankings_returns_rank_movement_and_filters_low_24h_hits():
    db = make_session()
    now = datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc)
    from invest_assistant.modules.market_radar.service import latest_rankings

    tag_up = Tag(name="升温", type="hotword", status="active")
    tag_down = Tag(name="降温", type="hotword", status="active")
    tag_new = Tag(name="新进", type="hotword", status="active")
    tag_one = Tag(name="低基数", type="hotword", status="active")
    db.add_all([tag_up, tag_down, tag_new, tag_one])
    db.flush()
    ignored_previous = now - timedelta(minutes=10)
    previous = now - timedelta(hours=1)
    add_heat(db, tag_up.id, "24h", ignored_previous, 6, 1)
    add_heat(db, tag_down.id, "24h", ignored_previous, 5, 2)
    add_heat(db, tag_down.id, "24h", previous, 5, 1)
    add_heat(db, tag_up.id, "24h", previous, 4, 2)
    add_heat(db, tag_one.id, "24h", previous, 1, 3)
    add_heat(db, tag_up.id, "24h", now, 6, 1)
    add_heat(db, tag_down.id, "24h", now, 5, 2)
    add_heat(db, tag_new.id, "24h", now, 3, 3)
    add_heat(db, tag_one.id, "24h", now, 1, 4)
    db.commit()

    rows = latest_rankings(db, "hotword", "24h")

    by_name = {row["tag"]["name"]: row for row in rows}
    assert list(by_name) == ["升温", "降温", "新进"]
    assert by_name["升温"]["previous_rank_no"] == 2
    assert by_name["升温"]["rank_change"] == 1
    assert by_name["升温"]["rank_movement"] == "up"
    assert by_name["降温"]["previous_rank_no"] == 1
    assert by_name["降温"]["rank_change"] == -1
    assert by_name["降温"]["rank_movement"] == "down"
    assert by_name["新进"]["previous_rank_no"] is None
    assert by_name["新进"]["rank_change"] is None
    assert by_name["新进"]["rank_movement"] == "new"
    assert "低基数" not in by_name


def test_latest_rankings_uses_rank_within_selected_tag_type():
    db = make_session()
    now = datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc)
    previous = now - timedelta(days=1)
    from invest_assistant.modules.market_radar.service import latest_rankings

    track = Tag(name="赛道词", type="track", status="active")
    stock = Tag(name="标的词", type="stock", status="active")
    hotword_up = Tag(name="热词上升", type="hotword", status="active")
    hotword_down = Tag(name="热词下降", type="hotword", status="active")
    db.add_all([track, stock, hotword_up, hotword_down])
    db.flush()

    add_heat(db, track.id, "7d", previous, 100, 1)
    add_heat(db, hotword_down.id, "7d", previous, 80, 2)
    add_heat(db, stock.id, "7d", previous, 70, 3)
    add_heat(db, hotword_up.id, "7d", previous, 60, 4)
    add_heat(db, track.id, "7d", now, 100, 1)
    add_heat(db, hotword_up.id, "7d", now, 90, 2)
    add_heat(db, stock.id, "7d", now, 70, 3)
    add_heat(db, hotword_down.id, "7d", now, 50, 4)
    db.commit()

    rows = latest_rankings(db, "hotword", "7d")

    assert [row["tag"]["name"] for row in rows] == ["热词上升", "热词下降"]
    assert [row["rank_no"] for row in rows] == [1, 2]
    assert rows[0]["previous_rank_no"] == 2
    assert rows[0]["rank_change"] == 1
    assert rows[1]["previous_rank_no"] == 1
    assert rows[1]["rank_change"] == -1


def test_latest_rankings_uses_window_specific_rank_change_baselines():
    db = make_session()
    now = datetime(2026, 6, 7, 12, 0, tzinfo=timezone.utc)
    from invest_assistant.modules.market_radar.service import latest_rankings

    tag = Tag(name="机器人", type="track", status="active")
    competitor_a = Tag(name="AI算力", type="track", status="active")
    competitor_b = Tag(name="商业航天", type="track", status="active")
    db.add_all([tag, competitor_a, competitor_b])
    db.flush()

    baselines = {
        "24h": now - timedelta(hours=1),
        "7d": now - timedelta(days=1),
        "30d": now - timedelta(days=7),
    }
    for window, previous in baselines.items():
        add_heat(db, tag.id, window, now - timedelta(minutes=10), 7, 1)
        add_heat(db, competitor_a.id, window, now - timedelta(minutes=10), 5, 2)
        add_heat(db, competitor_b.id, window, now - timedelta(minutes=10), 4, 3)
        add_heat(db, competitor_a.id, window, previous, 9, 1)
        add_heat(db, competitor_b.id, window, previous, 8, 2)
        add_heat(db, tag.id, window, previous, 7, 3)
        add_heat(db, tag.id, window, now, 8, 1)
        add_heat(db, competitor_a.id, window, now, 5, 2)
        add_heat(db, competitor_b.id, window, now, 4, 3)
    db.commit()

    for window in baselines:
        rows = latest_rankings(db, "track", window)

        assert rows[0]["previous_rank_no"] == 3
        assert rows[0]["rank_change"] == 2
        assert rows[0]["rank_movement"] == "up"
