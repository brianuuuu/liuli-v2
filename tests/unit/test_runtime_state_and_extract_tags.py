from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.system_config.models import RuntimeState
from invest_assistant.modules.basic.system_config.service import get_runtime_state, set_runtime_state
from invest_assistant.modules.market_radar.models import SourceItem, SourceTag, Tag
from invest_assistant.modules.market_radar.service import backfill_source_tags, extract_tags


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


def add_source_item(db, title: str, content: str) -> SourceItem:
    item = SourceItem(source_type="news", source_name="manual", title=title, content=content)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def add_active_tag(db, name: str) -> Tag:
    tag = Tag(name=name, type="hotword", status="active")
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def test_runtime_state_upsert_updates_existing_key():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        first = set_runtime_state(db, "job.market_radar.extract_tags", "source_item_last_id", "12", value_type="int", ext={"batch": 1})
        second = set_runtime_state(db, "job.market_radar.extract_tags", "source_item_last_id", "18", value_type="int", ext={"batch": 2})

        rows = list(db.scalars(select(RuntimeState)))
        loaded = get_runtime_state(db, "job.market_radar.extract_tags", "source_item_last_id")
        assert first.id == second.id
        assert len(rows) == 1
        assert loaded is not None
        assert loaded.state_value == "18"
        assert loaded.value_type == "int"
        assert loaded.ext_json == {"batch": 2}
    finally:
        db.close()


def test_extract_tags_initializes_cursor_without_backfilling_history():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        add_active_tag(db, "GPU")
        historical = add_source_item(db, "GPU demand rises", "GPU orders expand")

        result = extract_tags(db)

        state = get_runtime_state(db, "job.market_radar.extract_tags", "source_item_last_id")
        assert result.processed_count == 0
        assert result.inserted_count == 0
        assert result.extra == {
            "old_cursor": None,
            "new_cursor": historical.id,
            "batch_limit": 500,
            "remaining_count": 0,
        }
        assert state is not None
        assert state.state_value == str(historical.id)
        assert db.scalar(select(func.count(SourceTag.id))) == 0
    finally:
        db.close()


def test_extract_tags_processes_only_items_after_cursor_and_advances_on_misses():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        add_active_tag(db, "GPU")
        old_item = add_source_item(db, "GPU old item", "GPU old content")
        hit_item = add_source_item(db, "GPU demand rises", "GPU orders expand")
        miss_item = add_source_item(db, "Unrelated market news", "No matching token")
        set_runtime_state(db, "job.market_radar.extract_tags", "source_item_last_id", str(old_item.id), value_type="int")

        result = extract_tags(db, batch_limit=10)

        matched_source_ids = list(db.scalars(select(SourceTag.source_item_id).order_by(SourceTag.source_item_id.asc())))
        state = get_runtime_state(db, "job.market_radar.extract_tags", "source_item_last_id")
        assert matched_source_ids == [hit_item.id]
        assert result.processed_count == 2
        assert result.inserted_count == 1
        assert result.extra == {
            "old_cursor": old_item.id,
            "new_cursor": miss_item.id,
            "batch_limit": 10,
            "remaining_count": 0,
        }
        assert state is not None
        assert state.state_value == str(miss_item.id)
    finally:
        db.close()


def test_backfill_source_tags_does_not_write_extract_tags_cursor():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        add_active_tag(db, "GPU")
        item = add_source_item(db, "GPU demand rises", "GPU orders expand")

        result = backfill_source_tags(db)

        state = get_runtime_state(db, "job.market_radar.extract_tags", "source_item_last_id")
        assert result.processed_count == 1
        assert result.inserted_count == 1
        assert db.scalar(select(SourceTag.source_item_id)) == item.id
        assert state is None
    finally:
        db.close()
