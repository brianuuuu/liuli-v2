import json
from datetime import datetime
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.disclosure_library import cninfo_client, service
from invest_assistant.modules.basic.disclosure_library import jobs as disclosure_jobs
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.disclosure_library.schemas import CompanyDisclosureCreate
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.stock_analysis.models import StockPoolItem


def make_session(tmp_path):
    db_path = tmp_path / "stock_announcements.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})

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


def test_fetch_cninfo_stock_announcements_uses_org_id_and_preserves_pdf_url(monkeypatch):
    captured_payloads = []

    monkeypatch.setattr(cninfo_client, "get_stock_org_id_map", lambda: {"000001": "gssz0000001"})

    def fake_post(payload):
        captured_payloads.append(dict(payload))
        return {
            "totalAnnouncement": 1,
            "announcements": [
                {
                    "secCode": "000001",
                    "secName": "平安银行",
                    "orgId": "gssz0000001",
                    "announcementTitle": "2025年年度权益分派实施公告",
                    "announcementTime": 1780588800000,
                    "adjunctUrl": "finalpage/2026-06-05/1225352449.PDF",
                }
            ],
        }

    monkeypatch.setattr(cninfo_client, "_post_cninfo_query", fake_post)

    rows = cninfo_client.fetch_stock_announcements(
        stock_code="000001",
        start_date="2026-06-01",
        end_date="2026-06-07",
        page_size=30,
        max_pages=2,
    )

    assert captured_payloads[0]["stock"] == "000001,gssz0000001"
    assert captured_payloads[0]["seDate"] == "2026-06-01~2026-06-07"
    assert rows[0].source_url == "http://static.cninfo.com.cn/finalpage/2026-06-05/1225352449.PDF"
    assert rows[0].report_period == "000001"


def test_fetch_stock_announcements_defaults_to_stock_pool_and_writes_source_items(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        pool_stock = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE", symbol="000001.SZ", status="active")
        outside_stock = Stock(stock_code="600000", stock_name="浦发银行", exchange="SSE", symbol="600000.SH", status="active")
        db.add_all([pool_stock, outside_stock])
        db.commit()
        db.add(StockPoolItem(stock_id=pool_stock.id, status="focused", source="manual"))
        db.commit()

        calls = []

        def fake_fetch(stock_code, start_date, end_date, page_size=30, max_pages=2, category=""):
            calls.append(
                {
                    "stock_code": stock_code,
                    "start_date": start_date,
                    "end_date": end_date,
                    "page_size": page_size,
                    "max_pages": max_pages,
                    "category": category,
                }
            )
            return [
                CompanyDisclosureCreate(
                    source="cninfo",
                    disclosure_type="announcement",
                    title="2025年年度权益分派实施公告",
                    publish_time=datetime(2026, 6, 5),
                    report_period=stock_code,
                    source_url=f"http://static.cninfo.com.cn/finalpage/{stock_code}.PDF",
                    parse_status="pending",
                )
            ]

        monkeypatch.setattr(service.cninfo_client, "fetch_stock_announcements", fake_fetch)

        result = service.fetch_stock_announcements(
            db,
            days=30,
            pool_status="focused",
            page_size=20,
            max_pages=1,
            auto_to_source_item=True,
        )

        disclosures = list(db.scalars(select(CompanyDisclosure)))
        source_items = list(db.scalars(select(SourceItem)))

        assert [call["stock_code"] for call in calls] == ["000001"]
        assert calls[0]["page_size"] == 20
        assert calls[0]["max_pages"] == 1
        assert result.inserted_count == 1
        assert result.extra["source_item_inserted_count"] == 1
        assert disclosures[0].stock_id == pool_stock.id
        assert source_items[0].source_type == "announcement"
        assert source_items[0].related_type == "company_disclosure"
        assert source_items[0].related_id == disclosures[0].id
        assert "平安银行" in source_items[0].content
        assert "000001" in source_items[0].content
    finally:
        db.close()


def test_fetch_stock_announcements_deduplicates_by_source_url(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE", symbol="000001.SZ", status="active")
        db.add(stock)
        db.commit()
        db.add(StockPoolItem(stock_id=stock.id, status="focused", source="manual"))
        db.commit()

        def fake_fetch(*_args, **_kwargs):
            return [
                CompanyDisclosureCreate(
                    source="cninfo",
                    disclosure_type="announcement",
                    title="第一次标题",
                    publish_time=datetime(2026, 6, 5),
                    report_period="000001",
                    source_url="http://static.cninfo.com.cn/finalpage/1225352449.PDF",
                    parse_status="pending",
                )
            ]

        monkeypatch.setattr(service.cninfo_client, "fetch_stock_announcements", fake_fetch)

        first = service.fetch_stock_announcements(db, pool_status="focused", auto_to_source_item=True)
        second = service.fetch_stock_announcements(db, pool_status="focused", auto_to_source_item=True)

        assert first.inserted_count == 1
        assert second.inserted_count == 0
        assert second.updated_count == 1
        assert len(list(db.scalars(select(CompanyDisclosure)))) == 1
        assert len(list(db.scalars(select(SourceItem)))) == 1
    finally:
        db.close()


def test_fetch_stock_announcements_writes_source_items_by_default(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE", symbol="000001.SZ", status="active")
        db.add(stock)
        db.commit()
        db.add(StockPoolItem(stock_id=stock.id, status="focused", source="manual"))
        db.commit()

        monkeypatch.setattr(
            service.cninfo_client,
            "fetch_stock_announcements",
            lambda *_args, **_kwargs: [
                CompanyDisclosureCreate(
                    source="cninfo",
                    disclosure_type="announcement",
                    title="公告标题",
                    publish_time=datetime(2026, 6, 5),
                    report_period="000001",
                    source_url="http://static.cninfo.com.cn/finalpage/no-source-item.PDF",
                    parse_status="pending",
                )
            ],
        )

        result = service.fetch_stock_announcements(db, pool_status="focused")

        assert result.inserted_count == 1
        assert result.extra["source_item_inserted_count"] == 1
        assert len(list(db.scalars(select(CompanyDisclosure)))) == 1
        assert len(list(db.scalars(select(SourceItem)))) == 1
    finally:
        db.close()


def test_disclosures_to_source_items_converts_only_missing_items(tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        first = service.create_disclosure(
            db,
            CompanyDisclosureCreate(
                source="cninfo",
                disclosure_type="announcement",
                title="已入流公告",
                publish_time=datetime(2026, 6, 5),
                source_url="http://static.cninfo.com.cn/finalpage/already.PDF",
                parse_status="pending",
            ),
        )
        second = service.create_disclosure(
            db,
            CompanyDisclosureCreate(
                source="cninfo",
                disclosure_type="announcement",
                title="待入流公告",
                publish_time=datetime(2026, 6, 6),
                source_url="http://static.cninfo.com.cn/finalpage/missing.PDF",
                parse_status="pending",
            ),
        )
        service.disclosure_to_source_item(db, first)

        result = service.disclosures_to_missing_source_items(db)

        source_items = list(db.scalars(select(SourceItem).order_by(SourceItem.id.asc())))
        assert result == {"total": 2, "converted": 1, "skipped": 1}
        assert len(source_items) == 2
        assert source_items[1].related_type == "company_disclosure"
        assert source_items[1].related_id == second.id

        second_result = service.disclosures_to_missing_source_items(db)

        assert second_result == {"total": 2, "converted": 0, "skipped": 2}
        assert len(list(db.scalars(select(SourceItem)))) == 2
    finally:
        db.close()


def test_stock_announcement_job_replaces_generic_cninfo_job():
    from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY

    assert "disclosure_library.fetch_stock_announcements" in JOB_REGISTRY
    assert "disclosure_library.fetch_cninfo" not in JOB_REGISTRY
    job = JOB_REGISTRY["disclosure_library.fetch_stock_announcements"]
    assert job.display_name == "拉取标的公告"
    assert job.cron_expr == "30 8 * * *"
    assert job.params_schema["days"]["default"] == 30
    assert job.params_schema["auto_to_source_item"] == {"type": "boolean", "label": "自动写入信息流", "default": True}


def test_stock_announcement_job_defaults_to_auto_source_item(monkeypatch):
    captured = {}

    class DummySession:
        def close(self):
            captured["closed"] = True

    monkeypatch.setattr(disclosure_jobs, "SessionLocal", lambda: DummySession())

    def fake_fetch_stock_announcements(db, **kwargs):
        captured.update(kwargs)
        return SimpleNamespace(success=True, message="ok")

    monkeypatch.setattr(disclosure_jobs.service, "fetch_stock_announcements", fake_fetch_stock_announcements)

    disclosure_jobs.fetch_stock_announcements_job()

    assert captured["auto_to_source_item"] is True
    assert captured["closed"] is True
