from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.alert_center import service as alert_service
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.disclosure_library import service as disclosure_service
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.job_center import service as job_service
from invest_assistant.modules.basic.job_center.models import JobRunLog, JobRunRequest
from invest_assistant.modules.basic.report_library import service as report_service
from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.market_radar import service as market_service
from invest_assistant.modules.market_radar.models import AiTagSuggestion, Hotword, SourceItem, TagHeatSnapshot, TrackTagRelation
from invest_assistant.modules.market_radar.schemas import SourceItemCreate
from invest_assistant.modules.stock_analysis import service as stock_service
from invest_assistant.modules.stock_analysis.models import StockMaterial
from invest_assistant.modules.track_discovery import service as track_service
from invest_assistant.modules.track_discovery.models import TrackMaterial
from invest_assistant.modules.track_discovery.schemas import TrackCreate


def make_session() -> Session:
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
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def test_market_radar_growth_lists_return_page_metadata():
    db = make_session()
    base_time = datetime(2026, 6, 10, 9, 0)
    for index in range(260):
        market_service.create_source_item(
            db,
            SourceItemCreate(
                source_type="news",
                source_name="manual",
                title=f"source-{index}",
                content=f"content-{index}",
                publish_time=base_time + timedelta(minutes=index),
            ),
        )
        db.add(Hotword(name=f"hotword-{index:03d}", status="active" if index % 2 == 0 else "archived"))
        db.add(AiTagSuggestion(suggested_text=f"tag-{index:03d}", status="pending" if index % 2 == 0 else "approved"))
    db.commit()

    source_page = market_service.list_source_items_page(db, limit=200, offset=0)
    hotword_page = market_service.list_hotwords_page(db, status="active", limit=50, offset=50)
    suggestion_page = market_service.list_ai_tag_suggestions_page(db, status="pending", limit=25, offset=100)
    hotword_search_page = market_service.list_hotwords_page(db, q="005", limit=20, offset=0)
    suggestion_search_page = market_service.list_ai_tag_suggestions_page(db, q="tag-006", limit=20, offset=0)

    assert len(source_page.items) == 100
    assert source_page.total == 260
    assert source_page.limit == 100
    assert source_page.has_more is True
    assert source_page.items[0]["title"] == "source-259"
    assert len(hotword_page.items) == 50
    assert hotword_page.total == 130
    assert hotword_page.offset == 50
    assert hotword_page.has_more is True
    assert len(suggestion_page.items) == 25
    assert suggestion_page.total == 130
    assert suggestion_page.has_more is True
    assert hotword_search_page.total == 1
    assert hotword_search_page.items[0]["name"] == "hotword-005"
    assert suggestion_search_page.total == 1
    assert suggestion_search_page.items[0].suggested_text == "tag-006"


def test_material_lists_return_filtered_total_and_max_page_size():
    db = make_session()
    stock = Stock(stock_code="300001", stock_name="重点科技", symbol="300001.SZ")
    db.add(stock)
    track = track_service.create_track(db, TrackCreate(name="机器人"))
    db.flush()
    for index in range(260):
        source = SourceItem(source_type="news", source_name="manual", title=f"材料 {index}", content=f"content {index}")
        db.add(source)
        db.flush()
        status = "pending" if index % 2 == 0 else "confirmed"
        db.add(StockMaterial(stock_id=stock.id, material_type="source_item", material_id=source.id, status=status))
        db.add(TrackMaterial(track_id=track["id"], material_type="source_item", material_id=source.id, status=status))
    db.commit()

    stock_page = stock_service.list_all_stock_materials_page(db, statuses=["pending"], limit=200, offset=0)
    stock_next_page = stock_service.list_stock_materials_page(db, stock.id, statuses=["pending"], limit=100, offset=100)
    track_page = track_service.list_all_materials_page(db, statuses=["pending"], limit=200, offset=0)
    track_next_page = track_service.list_materials_page(db, track["id"], statuses=["pending"], limit=100, offset=100)

    assert len(stock_page.items) == 100
    assert stock_page.total == 130
    assert stock_page.limit == 100
    assert stock_page.has_more is True
    assert stock_next_page.total == 130
    assert len(stock_next_page.items) == 30
    assert stock_next_page.has_more is False
    assert len(track_page.items) == 100
    assert track_page.total == 130
    assert track_page.limit == 100
    assert track_page.has_more is True
    assert track_next_page.total == 130
    assert len(track_next_page.items) == 30
    assert track_next_page.has_more is False


def test_job_request_and_log_lists_return_page_metadata():
    db = make_session()
    base_time = datetime(2026, 6, 10, 9, 0)
    for index in range(260):
        db.add(JobRunRequest(job_name="market_radar.fetch_news", status="success", requested_at=base_time + timedelta(minutes=index)))
        db.add(
            JobRunLog(
                job_name="market_radar.fetch_news" if index % 2 == 0 else "stock_analysis.sync_daily_bars",
                module_name="market_radar",
                trigger_type="manual",
                status="success",
                started_at=base_time + timedelta(minutes=index),
                finished_at=base_time + timedelta(minutes=index, seconds=1),
            )
        )
    db.commit()

    request_page = job_service.list_run_requests_page(db, limit=200, offset=0)
    log_page = job_service.list_job_logs_page(db, "market_radar.fetch_news", limit=50, offset=100)

    assert len(request_page.items) == 100
    assert request_page.total == 260
    assert request_page.limit == 100
    assert request_page.has_more is True
    assert request_page.items[0].requested_at > request_page.items[-1].requested_at
    assert len(log_page.items) == 30
    assert log_page.total == 130
    assert log_page.has_more is False


def test_console_growth_lists_return_page_metadata():
    db = make_session()
    base_time = datetime(2026, 6, 10, 9, 0)
    for index in range(260):
        db.add(
            AlertEvent(
                title=f"alert-{index}",
                message="message",
                status="unread" if index % 2 == 0 else "handled",
                event_time=base_time + timedelta(minutes=index),
            )
        )
        db.add(
            Report(
                title=f"report-{index}",
                report_type="stock",
                source_module="stock_analysis",
                file_path=f"reports/report-{index}.md",
                created_at=base_time + timedelta(minutes=index),
            )
        )
        db.add(
            CompanyDisclosure(
                source="manual",
                disclosure_type="announcement",
                title=f"disclosure-{index}",
                publish_time=base_time + timedelta(minutes=index),
            )
        )
    db.commit()

    alert_page = alert_service.list_events_page(db, limit=200, offset=0)
    report_page = report_service.list_reports_page(db, limit=50, offset=200)
    disclosure_page = disclosure_service.list_disclosures_page(db, limit=80, offset=160)
    alert_stats = alert_service.event_stats(db)

    assert len(alert_page.items) == 100
    assert alert_page.total == 260
    assert alert_page.limit == 100
    assert alert_page.has_more is True
    assert len(report_page.items) == 50
    assert report_page.total == 260
    assert report_page.has_more is True
    assert len(disclosure_page.items) == 80
    assert disclosure_page.total == 260
    assert disclosure_page.has_more is True
    assert alert_stats["unhandled"] == 130


def test_track_dashboard_limits_trend_points_and_preserves_summary():
    db = make_session()
    base_time = datetime(2026, 6, 10, 9, 0)
    tracks = [track_service.create_track(db, TrackCreate(name=f"赛道-{index:02d}", status="active")) for index in range(12)]
    for track in tracks:
        tag = market_service.ensure_tag(db, f"赛道-{track['id']:02d}", "track", "test", "active")
        db.add(TrackTagRelation(track_id=track["id"], tag_id=tag.id, source="test", status="active"))
        for point_index in range(45):
            for window in ("7d", "30d", "24h"):
                db.add(
                    TagHeatSnapshot(
                        tag_id=tag.id,
                        window_type=window,
                        stat_time=base_time + timedelta(minutes=point_index),
                        trigger_count=point_index,
                        source_count=point_index,
                        heat_score=float(track["id"] * 1000 + point_index),
                        avg_count=0,
                        rank_no=track["id"],
                    )
                )
        source = SourceItem(source_type="news", source_name="manual", title=f"材料 {track['id']}", content="content")
        db.add(source)
        db.flush()
        db.add(TrackMaterial(track_id=track["id"], material_type="source_item", material_id=source.id, status="pending"))
    db.commit()

    dashboard = track_service.get_dashboard(db)

    assert dashboard["summary"]["focus_tracks_count"] == 12
    assert dashboard["summary"]["pending_materials_count"] == 12
    assert dashboard["summary"]["warming_tracks_count"] == 0
    assert len(dashboard["heat_rankings"]) == 12
    assert len(dashboard["heat_trends"]) == 10
    assert len(dashboard["latest_materials"]) == 10
    assert all(len(trend["points"]) <= 90 for trend in dashboard["heat_trends"])
    assert all(
        len([point for point in trend["points"] if point["window_type"] == window]) <= 30
        for trend in dashboard["heat_trends"]
        for window in ("7d", "30d")
    )
