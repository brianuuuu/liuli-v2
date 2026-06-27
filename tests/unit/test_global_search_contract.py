from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.market_radar.models import Tag, TrackTagRelation
from invest_assistant.modules.stock_analysis import service as stock_service
from invest_assistant.modules.stock_analysis.models import StockPoolItem, StockTrackRelation
from invest_assistant.modules.track_discovery import service as track_service
from invest_assistant.modules.track_discovery.models import Track


def make_session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, future=True)()


def test_stock_pool_search_only_returns_pool_items():
    db = make_session()
    try:
        pooled = Stock(
            symbol="000001.SZ",
            stock_code="000001",
            stock_name="平安银行",
            name_pinyin="pinganyinhang",
            name_abbr="payh",
            exchange="SZSE",
        )
        outside_pool = Stock(
            symbol="000002.SZ",
            stock_code="000002",
            stock_name="平安地产",
            name_pinyin="pingandichan",
            name_abbr="padc",
            exchange="SZSE",
        )
        db.add_all([pooled, outside_pool])
        db.flush()
        db.add(StockPoolItem(stock_id=pooled.id, status="archived", source="manual"))
        db.commit()

        rows = stock_service.list_pool(db, q="平安", limit=8)

        assert [row["stock_id"] for row in rows] == [pooled.id]
        assert rows[0]["status"] == "archived"
    finally:
        db.close()


def test_track_search_matches_all_statuses_and_current_view():
    db = make_session()
    try:
        active = Track(name="AI 算力", status="active", current_view="海外算力需求继续增长")
        candidate = Track(name="低空经济", status="candidate", description="飞行器产业链")
        db.add_all([active, candidate])
        db.commit()

        by_view = track_service.list_tracks(db, q="海外", limit=8)
        by_description = track_service.list_tracks(db, q="飞行器", limit=8)

        assert [row["id"] for row in by_view] == [active.id]
        assert [row["id"] for row in by_description] == [candidate.id]
        assert by_description[0]["status"] == "candidate"
    finally:
        db.close()
