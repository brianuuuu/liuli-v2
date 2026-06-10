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
from invest_assistant.modules.market_radar.models import AiTagSuggestion, Hotword, SourceItem
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

    assert len(source_page.items) == 200
    assert source_page.total == 260
    assert source_page.has_more is True
    assert source_page.items[0]["title"] == "source-259"
    assert len(hotword_page.items) == 50
    assert hotword_page.total == 130
    assert hotword_page.offset == 50
    assert hotword_page.has_more is True
    assert len(suggestion_page.items) == 25
    assert suggestion_page.total == 130
    assert suggestion_page.has_more is True


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
    stock_next_page = stock_service.list_stock_materials_page(db, stock.id, statuses=["pending"], limit=200, offset=200)
    track_page = track_service.list_all_materials_page(db, statuses=["pending"], limit=200, offset=0)
    track_next_page = track_service.list_materials_page(db, track["id"], statuses=["pending"], limit=200, offset=200)

    assert len(stock_page.items) == 130
    assert stock_page.total == 130
    assert stock_page.limit == 200
    assert stock_page.has_more is False
    assert stock_next_page.total == 130
    assert stock_next_page.items == []
    assert len(track_page.items) == 130
    assert track_page.total == 130
    assert track_page.has_more is False
    assert track_next_page.total == 130
    assert track_next_page.items == []


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

    assert len(request_page.items) == 200
    assert request_page.total == 260
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

    assert len(alert_page.items) == 200
    assert alert_page.total == 260
    assert alert_page.has_more is True
    assert len(report_page.items) == 50
    assert report_page.total == 260
    assert report_page.has_more is True
    assert len(disclosure_page.items) == 80
    assert disclosure_page.total == 260
    assert disclosure_page.has_more is True
    assert alert_stats["unhandled"] == 130
