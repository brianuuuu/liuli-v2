from datetime import datetime, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.job_center.models import JobRunRequest
from invest_assistant.modules.basic.stock_master.models import Stock, StockAlias
from invest_assistant.modules.market_radar.models import HotwordAlias, SourceItem, SourceTag, Tag
from invest_assistant.modules.market_radar import service as market_radar_service
from invest_assistant.modules.market_radar.schemas import HotwordAliasCreate, SourceItemCreate
from invest_assistant.modules.market_radar.service import (
    create_hotword_alias,
    create_source_item,
    create_tag,
)
from invest_assistant.modules.market_radar.schemas import TagCreate
from invest_assistant.modules.track_discovery.models import Track, TrackAlias


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    return Session()


def test_source_item_ingest_persists_tag_name_and_alias_matches():
    db = make_session()
    try:
        stock = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE", status="active")
        track = Track(name="AI算力", status="active")
        db.add_all([stock, track])
        db.flush()
        stock_tag = Tag(name="平安银行", type="stock", stock_id=stock.id, status="active")
        track_tag = Tag(name="AI算力", type="track", track_id=track.id, status="active")
        hotword_tag = Tag(name="降息", type="hotword", status="active")
        db.add_all([stock_tag, track_tag, hotword_tag])
        db.flush()
        db.add_all(
            [
                StockAlias(stock_id=stock.id, alias="平安", alias_type="short", source="manual"),
                TrackAlias(track_id=track.id, alias="AI服务器", source="manual", status="active"),
                HotwordAlias(tag_id=hotword_tag.id, alias="货币宽松", source="manual", status="active"),
            ]
        )
        db.commit()

        source = create_source_item(
            db,
            SourceItemCreate(
                source_type="news",
                source_name="manual",
                title="平安与AI服务器",
                content="平安 和 AI服务器 受益，货币宽松预期升温。",
                publish_time=datetime(2026, 5, 24, 9, 0, 0),
            ),
        )

        rows = db.execute(
            select(SourceTag, Tag)
            .join(Tag, Tag.id == SourceTag.tag_id)
            .where(SourceTag.source_item_id == source.id)
            .order_by(Tag.type.asc(), Tag.name.asc())
        ).all()
        assert [(tag.type, tag.name, source_tag.trigger_text) for source_tag, tag in rows] == [
            ("hotword", "降息", "货币宽松"),
            ("stock", "平安银行", "平安"),
            ("track", "AI算力", "AI服务器"),
        ]
    finally:
        db.close()


def test_duplicate_source_item_backfills_missing_source_tags():
    db = make_session()
    try:
        create_tag(db, TagCreate(name="伊朗", type="hotword", status="active"))
        payload = SourceItemCreate(
            source_type="news",
            source_name="财联社",
            title="伊朗核问题进展",
            content="伊朗核问题仍在谈判中。",
            publish_time=datetime(2026, 5, 24, 16, 24, 54),
        )
        source = SourceItem(**payload.model_dump())
        db.add(source)
        db.commit()

        duplicate = create_source_item(db, payload)

        assert duplicate.id == source.id
        assert db.scalar(select(SourceTag).where(SourceTag.source_item_id == source.id)) is not None
    finally:
        db.close()


def test_backfill_source_tags_respects_type_and_time_window():
    db = make_session()
    try:
        stock_tag = create_tag(db, TagCreate(name="平安银行", type="stock", status="active"))
        hotword_tag = create_tag(db, TagCreate(name="伊朗", type="hotword", status="active"))
        old_time = datetime(2025, 1, 1, 10, 0, 0)
        recent_time = datetime(2026, 5, 24, 10, 0, 0)
        db.add_all(
            [
                SourceItem(source_type="news", source_name="manual", title="平安银行旧闻", content="平安银行", publish_time=old_time),
                SourceItem(source_type="news", source_name="manual", title="伊朗新闻", content="伊朗", publish_time=recent_time),
            ]
        )
        db.commit()

        result = market_radar_service.backfill_source_tags(
            db,
            tag_type="hotword",
            start_time=recent_time - timedelta(days=30),
            end_time=recent_time + timedelta(days=1),
        )

        assert result.inserted_count == 1
        assert db.scalar(select(SourceTag).where(SourceTag.tag_id == hotword_tag.id)) is not None
        assert db.scalar(select(SourceTag).where(SourceTag.tag_id == stock_tag.id)) is None
    finally:
        db.close()


def test_new_hotword_alias_schedules_backfill_request_with_default_window():
    db = make_session()
    try:
        tag = create_tag(db, TagCreate(name="机器人", type="hotword", status="active"))

        create_hotword_alias(db, tag.id, HotwordAliasCreate(alias="人形机器人"))

        request = db.scalar(select(JobRunRequest).where(JobRunRequest.job_name == "market_radar.backfill_source_tags"))
        assert request is not None
        assert '"tag_type": "hotword"' in request.params_json
        assert '"tag_id": ' in request.params_json
        assert '"start_time":' in request.params_json
    finally:
        db.close()
