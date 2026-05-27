from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.market_radar.models import SourceTag
from invest_assistant.modules.market_radar.schemas import SourceItemCreate, TagBindingCreate
from invest_assistant.modules.market_radar.service import backfill_source_tags, bind_track_tag, create_source_item
from invest_assistant.modules.track_discovery.material_generation import create_pending_materials_for_source_item
from invest_assistant.modules.track_discovery.models import TrackMaterial
from invest_assistant.modules.track_discovery.schemas import TrackCreate, TrackMaterialUpdate
from invest_assistant.modules.track_discovery.service import create_track, update_material


def make_session():
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
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def material_rows(db: Session) -> list[TrackMaterial]:
    return list(db.scalars(select(TrackMaterial).order_by(TrackMaterial.id.asc())))


def test_source_item_ingest_creates_pending_track_material_from_bound_tag():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        track = create_track(db, TrackCreate(name="AI Compute"))
        bind_track_tag(db, track["id"], TagBindingCreate(name="GPU", source="manual", status="active"))

        item = create_source_item(
            db,
            SourceItemCreate(source_type="news", source_name="manual", title="GPU demand rises", content="GPU orders expand"),
        )

        rows = material_rows(db)
        assert len(rows) == 1
        assert rows[0].track_id == track["id"]
        assert rows[0].material_type == "source_item"
        assert rows[0].material_id == item["id"]
        assert rows[0].status == "pending"
        assert rows[0].direction is None
        assert rows[0].importance_level is None
        assert rows[0].note is None
    finally:
        db.close()


def test_material_generation_is_idempotent_and_does_not_overwrite_manual_status():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        track = create_track(db, TrackCreate(name="AI Compute"))
        bind_track_tag(db, track["id"], TagBindingCreate(name="GPU", source="manual", status="active"))
        item = create_source_item(
            db,
            SourceItemCreate(source_type="news", source_name="manual", title="GPU demand rises", content="GPU orders expand"),
        )
        material = material_rows(db)[0]
        update_material(db, material.id, TrackMaterialUpdate(status="confirmed", note="manual confirmed"))

        inserted = create_pending_materials_for_source_item(db, item["id"])
        db.commit()

        rows = material_rows(db)
        assert inserted == 0
        assert len(rows) == 1
        assert rows[0].status == "confirmed"
        assert rows[0].note == "manual confirmed"
    finally:
        db.close()


def test_unbound_source_tag_does_not_create_track_material():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        create_track(db, TrackCreate(name="AI Compute"))
        item = create_source_item(
            db,
            SourceItemCreate(source_type="news", source_name="manual", title="GPU demand rises", content="GPU orders expand"),
        )

        assert item["source_tags"] == []
        assert material_rows(db) == []
    finally:
        db.close()


def test_backfill_source_tags_populates_missing_pending_materials_for_existing_items():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        track = create_track(db, TrackCreate(name="AI Compute"))
        bind_track_tag(db, track["id"], TagBindingCreate(name="GPU", source="manual", status="active"))
        item = create_source_item(
            db,
            SourceItemCreate(source_type="news", source_name="manual", title="GPU demand rises", content="GPU orders expand"),
        )
        db.query(SourceTag).delete()
        db.query(TrackMaterial).delete()
        db.commit()

        result = backfill_source_tags(db)

        rows = material_rows(db)
        assert result.inserted_count == 1
        assert len(rows) == 1
        assert rows[0].track_id == track["id"]
        assert rows[0].material_id == item["id"]
        assert rows[0].status == "pending"
    finally:
        db.close()
