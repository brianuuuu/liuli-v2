from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.models import KnowledgeNote
from invest_assistant.modules.market_radar.models import SourceItem, Tag, TrackTagRelation
from invest_assistant.modules.stock_analysis.models import StockTrackRelation
from invest_assistant.modules.track_discovery.models import Track, TrackAnalysisSnapshot, TrackMaterial, TrackStatusHistory
from invest_assistant.modules.track_discovery.schemas import (
    TrackAnalysisSnapshotCreate,
    TrackCreate,
    TrackMaterialCreate,
    TrackMaterialUpdate,
    TrackStatusChange,
)
from invest_assistant.modules.track_discovery.service import (
    change_track_status,
    create_analysis_snapshot,
    create_material,
    create_track,
    delete_candidate_track,
    list_analysis_snapshots,
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
            track_score=82,
            current_view="需求侧仍在扩张",
            stage="validate",
            confidence_level="medium",
        ),
    )

    assert track["track_score"] == 82
    assert track["current_view"] == "需求侧仍在扩张"
    assert track["stage"] == "validate"
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


def test_status_history_records_track_stage_change(db_session: Session):
    track = create_track(db_session, TrackCreate(name="商业航天", status="candidate", stage="concept"))

    changed = change_track_status(
        db_session,
        track["id"],
        TrackStatusChange(new_status="active", new_stage="validate", reason="材料增多", changed_by="manual"),
    )

    assert changed is not None
    assert changed["status"] == "active"
    assert changed["stage"] == "validate"
    history = db_session.scalar(select(TrackStatusHistory).where(TrackStatusHistory.track_id == track["id"]))
    assert history.old_status == "candidate"
    assert history.new_status == "active"
    assert history.old_stage == "concept"
    assert history.new_stage == "validate"
    assert history.changed_by == "manual"


def test_analysis_snapshots_are_listed_latest_first(db_session: Session):
    track = create_track(db_session, TrackCreate(name="机器人", track_score=70, confidence_level="medium"))

    create_analysis_snapshot(
        db_session,
        track["id"],
        TrackAnalysisSnapshotCreate(
            analysis_date=date(2026, 5, 26),
            market_space="全球自动化",
            score=70,
            confidence_level="medium",
        ),
    )
    latest = create_analysis_snapshot(
        db_session,
        track["id"],
        TrackAnalysisSnapshotCreate(
            analysis_date=date(2026, 5, 27),
            market_space="人形机器人",
            score=75,
            confidence_level="high",
        ),
    )

    rows = list_analysis_snapshots(db_session, track["id"])

    assert rows[0].id == latest.id
    assert rows[0].market_space == "人形机器人"


def test_candidate_delete_cleans_new_track_children_and_stock_bindings(db_session: Session):
    track = create_track(db_session, TrackCreate(name="低空经济", status="candidate"))
    stock = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE")
    db_session.add(stock)
    db_session.commit()
    db_session.add(StockTrackRelation(stock_id=stock.id, track_id=track["id"], status="active"))
    db_session.add(TrackMaterial(track_id=track["id"], material_type="knowledge_note", material_id=1, status="pending"))
    db_session.add(TrackAnalysisSnapshot(track_id=track["id"], analysis_date=date(2026, 5, 27)))
    db_session.add(TrackStatusHistory(track_id=track["id"], new_status="candidate"))
    db_session.commit()

    assert delete_candidate_track(db_session, track["id"]) is True

    assert db_session.get(Track, track["id"]) is None
    assert db_session.scalar(select(TrackMaterial).where(TrackMaterial.track_id == track["id"])) is None
    assert db_session.scalar(select(TrackAnalysisSnapshot).where(TrackAnalysisSnapshot.track_id == track["id"])) is None
    assert db_session.scalar(select(TrackStatusHistory).where(TrackStatusHistory.track_id == track["id"])) is None
    assert db_session.scalar(select(StockTrackRelation).where(StockTrackRelation.track_id == track["id"])) is None
    assert db_session.scalar(select(Tag).where(Tag.name == "低空经济")) is None
