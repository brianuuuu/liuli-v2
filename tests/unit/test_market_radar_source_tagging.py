from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.market_radar.models import SourceTag, Tag
from invest_assistant.modules.market_radar.schemas import SourceItemCreate, TagBindingCreate
from invest_assistant.modules.market_radar.service import bind_hotword_tag, create_hotword, create_source_item
from invest_assistant.modules.market_radar.schemas import HotwordCreate


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def test_source_item_ingest_matches_active_tag_words():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        hotword = create_hotword(db, HotwordCreate(name="降息", status="active"))
        bind_hotword_tag(db, hotword["id"], TagBindingCreate(name="货币宽松", source="manual", status="active"))

        item = create_source_item(
            db,
            SourceItemCreate(
                source_type="news",
                source_name="manual",
                title="市场交易货币宽松预期",
                content="货币宽松 继续成为主线。",
            ),
        )

        rows = db.execute(select(SourceTag, Tag).join(Tag, Tag.id == SourceTag.tag_id)).all()
        assert item["id"] is not None
        assert [(tag.name, source_tag.trigger_text) for source_tag, tag in rows] == [("货币宽松", "货币宽松")]
    finally:
        db.close()


def test_duplicate_source_item_backfills_missing_source_tags():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        create_hotword(db, HotwordCreate(name="伊朗", status="active"))
        payload = SourceItemCreate(source_type="news", source_name="manual", title="伊朗局势", content="伊朗 消息")
        first = create_source_item(db, payload)
        db.query(SourceTag).delete()
        db.commit()

        second = create_source_item(db, payload)

        assert second["id"] == first["id"]
        assert db.scalar(select(SourceTag).where(SourceTag.source_item_id == first["id"])) is not None
    finally:
        db.close()
