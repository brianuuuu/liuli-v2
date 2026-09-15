"""归档等同软删除：赛道库和标的池的默认列表不返回，只有回收站视图显式点名才拿得到。"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import invest_assistant.modules.basic.report_library.models  # noqa: F401  # knowledge_research_feedback 的 FK 目标表
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.mcp.tools import track_discovery as mcp_track_discovery
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.stock_analysis import service as stock_service
from invest_assistant.modules.stock_analysis.models import StockPoolItem, StockTrackRelation
from invest_assistant.modules.track_discovery import service as track_service
from invest_assistant.modules.track_discovery.models import Track


def make_session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, future=True)()


def seed_pool(db):
    stocks = [
        Stock(symbol="000001.SZ", stock_code="000001", stock_name="平安银行", exchange="SZSE"),
        Stock(symbol="000002.SZ", stock_code="000002", stock_name="万科A", exchange="SZSE"),
    ]
    db.add_all(stocks)
    db.flush()
    db.add_all(
        [
            StockPoolItem(stock_id=stocks[0].id, status="focused", source="manual"),
            StockPoolItem(stock_id=stocks[1].id, status="archived", source="manual"),
        ]
    )
    db.commit()
    return stocks


def test_pool_default_list_drops_archived():
    db = make_session()
    try:
        live, archived = seed_pool(db)

        rows = stock_service.list_pool(db)

        assert [row["stock_id"] for row in rows] == [live.id]
        assert archived.id not in {row["stock_id"] for row in rows}
    finally:
        db.close()


def test_pool_recycle_bin_needs_explicit_archived_status():
    db = make_session()
    try:
        _live, archived = seed_pool(db)

        rows = stock_service.list_pool(db, status="archived")

        assert [row["stock_id"] for row in rows] == [archived.id]
    finally:
        db.close()


def test_pool_other_status_filters_stay_scoped():
    db = make_session()
    try:
        live, _archived = seed_pool(db)

        assert [row["stock_id"] for row in stock_service.list_pool(db, status="focused")] == [live.id]
        assert stock_service.list_pool(db, status="watching") == []
    finally:
        db.close()


def seed_tracks(db):
    tracks = [
        Track(name="AI 算力", status="active"),
        Track(name="低空经济", status="archived"),
    ]
    db.add_all(tracks)
    db.commit()
    return tracks


def test_track_default_list_drops_archived():
    db = make_session()
    try:
        live, archived = seed_tracks(db)

        rows = track_service.list_tracks(db)

        assert [row["id"] for row in rows] == [live.id]
        assert archived.id not in {row["id"] for row in rows}
    finally:
        db.close()


def test_track_recycle_bin_needs_explicit_archived_status():
    db = make_session()
    try:
        _live, archived = seed_tracks(db)

        rows = track_service.list_tracks(db, status="archived")

        assert [row["id"] for row in rows] == [archived.id]
    finally:
        db.close()


def test_track_keyword_search_skips_archived():
    db = make_session()
    try:
        db.add_all([Track(name="机器人", status="archived", description="人形机器人产业链")])
        db.commit()

        assert track_service.list_tracks(db, q="机器人") == []
    finally:
        db.close()


def test_pool_dashboard_stats_skip_archived():
    """看板汇总从 pool_rows 派生，归档不该再算进 pool_count / 排行。"""
    db = make_session()
    try:
        live, archived = seed_pool(db)

        dashboard = stock_service.get_dashboard(db)

        assert dashboard["summary"]["pool_count"] == 1
        assert dashboard["summary"]["focused_count"] == 1
        ranked = {row["stock_id"] for row in dashboard["score_rankings"]}
        assert ranked == {live.id}
        assert archived.id not in ranked
    finally:
        db.close()


def test_track_dashboard_stats_skip_archived():
    """热度榜和重点赛道都从 tracks 派生，归档不该再出现。"""
    db = make_session()
    try:
        live, archived = seed_tracks(db)

        dashboard = track_service.get_dashboard(db)

        ranked = {row["track_id"] for row in dashboard["heat_rankings"]}
        assert ranked == {live.id}
        assert archived.id not in ranked
        assert archived.id not in {row["track_id"] for row in dashboard["focus_tracks"]}
    finally:
        db.close()


def test_pool_row_drops_archived_track_bindings():
    """关系还是 active，但赛道已归档，就不该再挂在标的上。"""
    db = make_session()
    try:
        live_stock, _archived_stock = seed_pool(db)
        live_track, archived_track = seed_tracks(db)
        db.add_all(
            [
                StockTrackRelation(stock_id=live_stock.id, track_id=live_track.id, status="active"),
                StockTrackRelation(stock_id=live_stock.id, track_id=archived_track.id, status="active"),
            ]
        )
        db.commit()

        row = next(row for row in stock_service.list_pool(db) if row["stock_id"] == live_stock.id)

        assert [track["id"] for track in row["tracks"]] == [live_track.id]
    finally:
        db.close()


def test_mcp_track_list_refuses_archived_status():
    """回收站是脏数据，不对外部 MCP 调用方开放。"""
    with pytest.raises(ValueError, match="archived"):
        mcp_track_discovery.list_tracks(db=None, client=None, status="archived")
