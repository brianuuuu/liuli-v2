from datetime import date

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.models import KnowledgeNote
from invest_assistant.modules.market_radar.models import SourceItem, Tag, TrackTagRelation
from invest_assistant.modules.stock_analysis.models import StockTrackRelation
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial, TrackStatusHistory, TrackTrendSnapshot
from invest_assistant.modules.track_discovery.schemas import (
    TrackTrendSnapshotCreate,
    TrackCreate,
    TrackMaterialCreate,
    TrackMaterialUpdate,
    TrackStatusChange,
)
from invest_assistant.modules.track_discovery.service import (
    change_track_status,
    create_trend_snapshot,
    create_material,
    create_track,
    delete_candidate_track,
    list_trend_snapshots,
    list_materials,
    update_material,
)


@pytest.fixture()
def db_session() -> Session:
    engine = create_engine("sqlite:///:memory:")

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
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    with SessionLocal() as session:
        yield session


def test_track_fields_and_same_name_tag_binding(db_session: Session):
    track = create_track(
        db_session,
        TrackCreate(
            name="AI算力",
            description="算力基础设施",
            status="candidate",
            current_view="需求侧仍在扩张",
            industry_phase="expansion",
            market_phase="ferment",
            confidence_level="medium",
        ),
    )

    assert track["current_view"] == "需求侧仍在扩张"
    assert track["industry_phase"] == "expansion"
    assert track["market_phase"] == "ferment"
    assert track["confidence_level"] == "medium"
    assert track["tag"]["name"] == "AI算力"
    assert db_session.scalar(select(TrackTagRelation).where(TrackTagRelation.track_id == track["id"])) is not None


def test_track_material_unique_reference_and_status_update(db_session: Session):
    track = create_track(db_session, TrackCreate(name="AI算力"))
    note = KnowledgeNote(title="复盘", content="算力复盘", note_type="review")
    db_session.add(note)
    db_session.commit()

    material = create_material(
        db_session,
        track["id"],
        TrackMaterialCreate(
            material_type="knowledge_note",
            material_id=note.id,
            direction="support",
            importance_level="high",
            status="pending",
            note="验证供需判断",
        ),
    )

    assert material.material_type == "knowledge_note"
    assert material.status == "pending"
    assert list_materials(db_session, track["id"])[0]["id"] == material.id

    updated = update_material(db_session, material.id, TrackMaterialUpdate(status="confirmed", note="纳入当前判断"))

    assert updated is not None
    assert updated.status == "confirmed"
    assert updated.note == "纳入当前判断"

    db_session.add(
        TrackMaterial(
            track_id=track["id"],
            material_type="knowledge_note",
            material_id=note.id,
            status="pending",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_track_material_list_includes_referenced_material_summary(db_session: Session):
    track = create_track(db_session, TrackCreate(name="AI Agents"))
    source = SourceItem(
        source_type="news",
        source_name="manual",
        title="Agent tooling demand rises",
        content="Enterprise teams are adopting agent workflow tools. The relevant part should be summarized for review.",
        source_url="https://example.com/agent",
    )
    note = KnowledgeNote(title="复盘：Agent 工具链", content="这是个人复盘内容，用于验证知识笔记摘要。", note_type="review")
    db_session.add_all([source, note])
    db_session.commit()

    create_material(
        db_session,
        track["id"],
        TrackMaterialCreate(material_type="source_item", material_id=source.id, status="pending"),
    )
    create_material(
        db_session,
        track["id"],
        TrackMaterialCreate(material_type="knowledge_note", material_id=note.id, status="confirmed"),
    )

    rows = list_materials(db_session, track["id"])

    source_row = next(item for item in rows if item["material_type"] == "source_item")
    note_row = next(item for item in rows if item["material_type"] == "knowledge_note")
    assert source_row["material_title"] == "Agent tooling demand rises"
    assert source_row["material_summary"].startswith("Enterprise teams are adopting")
    assert source_row["material_source_name"] == "manual"
    assert source_row["material_url"] == "https://example.com/agent"
    assert note_row["material_title"] == "复盘：Agent 工具链"
    assert note_row["material_summary"] == "这是个人复盘内容，用于验证知识笔记摘要。"


def test_track_material_list_filters_statuses_and_paginates(db_session: Session):
    track = create_track(db_session, TrackCreate(name="能源"))
    source_items = [
        SourceItem(source_type="news", source_name="manual", title=f"能源材料 {index}", content=f"content {index}")
        for index in range(4)
    ]
    db_session.add_all(source_items)
    db_session.commit()
    for source, status in zip(source_items, ["pending", "confirmed", "ignored", "confirmed"]):
        create_material(db_session, track["id"], TrackMaterialCreate(material_type="source_item", material_id=source.id, status=status))

    active_rows = list_materials(db_session, track["id"], statuses=["pending", "confirmed"], limit=2, offset=0)
    ignored_rows = list_materials(db_session, track["id"], statuses=["ignored"])
    next_page = list_materials(db_session, track["id"], statuses=["pending", "confirmed"], limit=2, offset=2)

    assert [row["status"] for row in active_rows] == ["confirmed", "confirmed"]
    assert [row["material_title"] for row in active_rows] == ["能源材料 3", "能源材料 1"]
    assert [row["status"] for row in ignored_rows] == ["ignored"]
    assert [row["status"] for row in next_page] == ["pending"]


def test_all_track_materials_can_filter_by_status_track_and_include_track_name(db_session: Session):
    energy = create_track(db_session, TrackCreate(name="能源"))
    robot = create_track(db_session, TrackCreate(name="机器人"))
    sources = [
        SourceItem(source_type="news", source_name="manual", title="能源待处理", content="energy pending"),
        SourceItem(source_type="news", source_name="manual", title="能源已忽略", content="energy ignored"),
        SourceItem(source_type="news", source_name="manual", title="机器人已确认", content="robot confirmed"),
    ]
    db_session.add_all(sources)
    db_session.commit()
    create_material(db_session, energy["id"], TrackMaterialCreate(material_type="source_item", material_id=sources[0].id, status="pending"))
    create_material(db_session, energy["id"], TrackMaterialCreate(material_type="source_item", material_id=sources[1].id, status="ignored"))
    create_material(db_session, robot["id"], TrackMaterialCreate(material_type="source_item", material_id=sources[2].id, status="confirmed"))

    from invest_assistant.modules.track_discovery.service import list_all_materials

    default_rows = list_all_materials(db_session, statuses=["pending", "confirmed"], limit=10, offset=0)
    ignored_energy_rows = list_all_materials(db_session, track_id=energy["id"], statuses=["ignored"], limit=10, offset=0)

    assert [row["material_title"] for row in default_rows] == ["机器人已确认", "能源待处理"]
    assert all(row["status"] != "ignored" for row in default_rows)
    assert ignored_energy_rows[0]["material_title"] == "能源已忽略"
    assert ignored_energy_rows[0]["track_name"] == "能源"


def test_status_history_records_track_phase_change(db_session: Session):
    """产业阶段和市场阶段各自独立记录，一次变更两条都要留痕。"""
    track = create_track(db_session, TrackCreate(name="商业航天", status="candidate", industry_phase="intro", market_phase="latent"))

    changed = change_track_status(
        db_session,
        track["id"],
        TrackStatusChange(
            new_status="active",
            new_industry_phase="expansion",
            new_market_phase="start",
            reason="材料增多",
            changed_by="manual",
        ),
    )

    assert changed is not None
    assert changed["status"] == "active"
    assert changed["industry_phase"] == "expansion"
    assert changed["market_phase"] == "start"
    history = db_session.scalar(select(TrackStatusHistory).where(TrackStatusHistory.track_id == track["id"]))
    assert history.old_status == "candidate"
    assert history.new_status == "active"
    assert history.old_industry_phase == "intro"
    assert history.new_industry_phase == "expansion"
    assert history.old_market_phase == "latent"
    assert history.new_market_phase == "start"
    assert history.changed_by == "manual"


def snapshot_payload(research_date: date, **overrides) -> TrackTrendSnapshotCreate:
    """六维评分是必填项，用例只写自己关心的那几维，其余给中性分。"""
    values = {
        "research_date": research_date,
        "headline_cycle": "long",
        "market_heat_score": 5.0,
        "growth_speed_score": 5.0,
        "concentration_score": 5.0,
        "cycle_resilience_score": 5.0,
        "current_market_size_score": 5.0,
        "future_market_size_score": 5.0,
    }
    values.update(overrides)
    return TrackTrendSnapshotCreate(**values)


def test_trend_snapshot_derives_overall_score_grade_and_heat_tier(db_session: Session):
    """派生三项由服务端从六维算出：调用方传不进来，也不可能和分数对不上。"""
    track = create_track(db_session, TrackCreate(name="AI算力"))

    snapshot = create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(
            date(2026, 7, 5),
            market_heat_score=9.5,
            growth_speed_score=9.0,
            concentration_score=8.0,
            cycle_resilience_score=6.5,
            current_market_size_score=7.5,
            future_market_size_score=9.0,
        ),
    )

    # (9.5 + 9 + 8 + 6.5 + 7.5 + 9) / 6 = 8.25 -> S；市场热度 9.5 -> T0
    assert snapshot.overall_score == 8.25
    assert snapshot.track_grade == "S"
    assert snapshot.heat_tier == "T0"


def test_trend_snapshot_grade_and_tier_move_with_scores(db_session: Session):
    """评级看六维平均，热度档位只看市场热度：两者各自独立，经常背离。"""
    track = create_track(db_session, TrackCreate(name="固态电池"))

    # 基本面扎实但市场还没发现：S 级 T4
    unnoticed = create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(
            date(2026, 7, 5),
            market_heat_score=1.0,
            growth_speed_score=9.5,
            concentration_score=9.5,
            cycle_resilience_score=9.5,
            current_market_size_score=9.5,
            future_market_size_score=9.5,
        ),
    )
    assert unnoticed.track_grade == "S"
    assert unnoticed.heat_tier == "T4"

    # 正在被炒作但基本面一般：D 级 T0
    hyped = create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(
            date(2026, 7, 6),
            market_heat_score=10.0,
            growth_speed_score=3.0,
            concentration_score=3.0,
            cycle_resilience_score=3.0,
            current_market_size_score=3.0,
            future_market_size_score=3.0,
        ),
    )
    assert hyped.track_grade == "D"
    assert hyped.heat_tier == "T0"


def test_trend_snapshot_rejects_out_of_range_score(db_session: Session):
    """越界分数当场报错：夹到边界会把量纲错误原样写进评级，人却看不出来。"""
    with pytest.raises(ValidationError):
        snapshot_payload(date(2026, 7, 5), market_heat_score=12)
    with pytest.raises(ValidationError):
        snapshot_payload(date(2026, 7, 5), market_heat_score=-1)


def test_trend_snapshots_are_listed_latest_first_and_backfill_track(db_session: Session):
    track = create_track(db_session, TrackCreate(name="机器人", confidence_level="medium"))

    create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(
            date(2026, 5, 26),
            headline_cycle="mid",
            core_judgment="全球自动化仍在渗透",
            industry_phase="expansion",
            market_phase="ferment",
        ),
    )
    latest = create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(
            date(2026, 5, 27),
            core_judgment="人形机器人进入量产验证",
            industry_phase="expansion",
            market_phase="accelerate",
        ),
    )

    rows = list_trend_snapshots(db_session, track["id"])

    assert rows[0].id == latest.id
    assert rows[0].core_judgment == "人形机器人进入量产验证"

    # 快照是结论的唯一真相，track 上这几项只是导入回填的派生缓存
    row = db_session.get(Track, track["id"])
    assert row.latest_snapshot_id == latest.id
    assert row.current_view == "人形机器人进入量产验证"
    assert row.market_phase == "accelerate"


def test_same_day_correction_replaces_earlier_snapshot(db_session: Session):
    """修补报告是当日追加的新记录：research_date 相同、id 更大，应当取代当天的上一份。"""
    track = create_track(db_session, TrackCreate(name="固态电池"))
    create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(
            date(2026, 5, 27),
            headline_cycle="mid",
            core_judgment="装车进度待观察",
            market_phase="ferment",
        ),
    )
    correction = create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(
            date(2026, 5, 27),
            headline_cycle="mid",
            core_judgment="修正：装车节点提前，判断上调",
            market_phase="accelerate",
            growth_speed_score=9.0,
        ),
    )

    row = db_session.get(Track, track["id"])
    assert row.latest_snapshot_id == correction.id
    assert row.current_view == "修正：装车节点提前，判断上调"
    assert row.market_phase == "accelerate"

    # 列表同样按 (research_date desc, id desc)，修补报告排在当天上一份之前
    rows = list_trend_snapshots(db_session, track["id"])
    assert rows[0].id == correction.id
    assert rows[0].growth_speed_score == 9.0
    assert rows[1].growth_speed_score == 5.0


def test_backfill_skips_older_snapshot(db_session: Session):
    """补录一份旧报告不能把最新结论盖掉。"""
    track = create_track(db_session, TrackCreate(name="低空经济"))
    latest = create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(date(2026, 5, 27), market_phase="accelerate"),
    )
    create_trend_snapshot(
        db_session,
        track["id"],
        snapshot_payload(date(2026, 5, 20), headline_cycle="short", market_phase="latent"),
    )

    row = db_session.get(Track, track["id"])
    assert row.latest_snapshot_id == latest.id
    assert row.market_phase == "accelerate"


def test_candidate_delete_cleans_new_track_children_and_stock_bindings(db_session: Session):
    track = create_track(db_session, TrackCreate(name="低空经济", status="candidate"))
    stock = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE")
    db_session.add(stock)
    db_session.commit()
    db_session.add(StockTrackRelation(stock_id=stock.id, track_id=track["id"], status="active"))
    db_session.add(TrackMaterial(track_id=track["id"], material_type="knowledge_note", material_id=1, status="pending"))
    db_session.add(
        TrackTrendSnapshot(
            track_id=track["id"],
            research_date=date(2026, 5, 27),
            headline_cycle="long",
            market_heat_score=5.0,
            growth_speed_score=5.0,
            concentration_score=5.0,
            cycle_resilience_score=5.0,
            current_market_size_score=5.0,
            future_market_size_score=5.0,
            overall_score=5.0,
            track_grade="C",
            heat_tier="T2",
        )
    )
    db_session.add(TrackStatusHistory(track_id=track["id"], new_status="candidate"))
    db_session.commit()

    assert delete_candidate_track(db_session, track["id"]) is True

    assert db_session.get(Track, track["id"]) is None
    assert db_session.scalar(select(TrackMaterial).where(TrackMaterial.track_id == track["id"])) is None
    assert db_session.scalar(select(TrackTrendSnapshot).where(TrackTrendSnapshot.track_id == track["id"])) is None
    assert db_session.scalar(select(TrackStatusHistory).where(TrackStatusHistory.track_id == track["id"])) is None
    assert db_session.scalar(select(StockTrackRelation).where(StockTrackRelation.track_id == track["id"])) is None
    assert db_session.scalar(select(Tag).where(Tag.name == "低空经济")) is None
