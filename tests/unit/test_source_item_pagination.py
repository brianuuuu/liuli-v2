from datetime import date, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master import models as _stock_models  # noqa: F401
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.models import SourceItem, SourceTag, Tag
from invest_assistant.modules.stock_analysis import models as _stock_analysis_models  # noqa: F401
from invest_assistant.modules.track_discovery import models as _track_models  # noqa: F401
from invest_assistant.modules.market_radar.schemas import SourceItemCreate


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def test_list_source_items_limits_and_offsets_by_publish_time():
    SessionLocal = make_session()
    db = SessionLocal()
    base_time = datetime(2026, 5, 26, 9, 0, 0)
    try:
        for index in range(5):
            service.create_source_item(
                db,
                SourceItemCreate(
                    source_type="news",
                    source_name="manual",
                    title=f"item-{index}",
                    content=f"content-{index}",
                    publish_time=base_time + timedelta(minutes=index),
                ),
            )

        first_page = service.list_source_items(db, limit=2, offset=0)
        second_page = service.list_source_items(db, limit=2, offset=2)

        assert [item["title"] for item in first_page] == ["item-4", "item-3"]
        assert [item["title"] for item in second_page] == ["item-2", "item-1"]
        assert service.count_source_items(db) == 5
    finally:
        db.close()


def test_count_source_items_by_day_counts_beyond_list_page_limit():
    SessionLocal = make_session()
    db = SessionLocal()
    target_day = date(2026, 6, 5)
    base_time = datetime(2026, 6, 5, 9, 0, 0)
    try:
        source_types = ["news", "announcement", "financial", "sentiment", "research"]
        for index in range(260):
            source_type = source_types[index % len(source_types)]
            service.create_source_item(
                db,
                SourceItemCreate(
                    source_type=source_type,
                    source_name="manual",
                    title=f"today-item-{index}",
                    content=f"content-{index}",
                    publish_time=base_time + timedelta(minutes=index),
                ),
            )
        service.create_source_item(
            db,
            SourceItemCreate(
                source_type="news",
                source_name="manual",
                title="yesterday-item",
                content="old content",
                publish_time=datetime(2026, 6, 4, 23, 0, 0),
            ),
        )
        fallback = service.create_source_item(
            db,
            SourceItemCreate(
                source_type="report_summary",
                source_name="manual",
                title="created-at-fallback",
                content="fallback content",
                publish_time=None,
            ),
        )
        db.get(SourceItem, fallback["id"]).created_at = datetime(2026, 6, 5, 12, 0, 0)
        db.commit()

        stats = service.count_source_items_by_day(db, target_day)

        assert fallback is not None
        assert len(service.list_source_items(db, limit=200)) == 100
        assert stats == {
            "total": 261,
            "news": 52,
            "announcement": 104,
            "sentiment": 52,
            "report": 53,
        }
    finally:
        db.close()


def test_list_source_items_page_filters_in_database_and_counts_filtered_total():
    SessionLocal = make_session()
    db = SessionLocal()
    base_time = datetime(2026, 6, 6, 9, 0, 0)
    try:
        tag = Tag(name="数据库筛选专用标签", type="track", status="active")
        db.add(tag)
        db.flush()
        for index in range(120):
            source_name = "东方财富" if index < 110 else "富途牛牛"
            source_type = "news" if index % 2 == 0 else "announcement"
            content = "重大 AI 订单落地" if index % 10 == 0 else "普通信息流"
            item = service.create_source_item(
                db,
                SourceItemCreate(
                    source_type=source_type,
                    source_name=source_name,
                    title=f"普通跟踪 {index}",
                    content=content,
                    publish_time=base_time + timedelta(minutes=index),
                ),
            )
            if index % 3 == 0:
                db.add(SourceTag(source_item_id=item["id"], tag_id=tag.id, confidence=1, extractor="test"))
        service.create_source_item(
            db,
            SourceItemCreate(
                source_type="announcement",
                source_name="cninfo",
                title="巨潮公告",
                content="机器人 重大 合同公告",
                publish_time=base_time + timedelta(hours=3),
            ),
        )
        db.commit()

        eastmoney_page = service.list_source_items_page(db, limit=100, offset=0, source_name="东方财富")
        cninfo_page = service.list_source_items_page(db, limit=100, offset=0, source_name="cninfo")
        query_page = service.list_source_items_page(db, limit=100, offset=0, q="跟踪 11")
        type_page = service.list_source_items_page(db, limit=100, offset=0, source_type="announcement")
        important_page = service.list_source_items_page(db, limit=100, offset=0, important_only=True)
        tag_page = service.list_source_items_page(db, limit=100, offset=0, tag_id=tag.id)

        assert len(eastmoney_page.items) == 100
        assert eastmoney_page.total == 110
        assert eastmoney_page.has_more is True
        assert cninfo_page.total == 1
        assert cninfo_page.items[0]["source_name"] == "cninfo"
        assert query_page.total == 11
        assert type_page.total == 61
        assert important_page.total == 13
        assert tag_page.total == 40
    finally:
        db.close()
