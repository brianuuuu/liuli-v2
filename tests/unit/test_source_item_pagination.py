from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master import models as _stock_models  # noqa: F401
from invest_assistant.modules.market_radar import service
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
