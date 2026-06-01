import os
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

test_db_path = Path(tempfile.gettempdir()) / "liuli_test_basic_modules.sqlite3"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path.as_posix()}"

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.job_center.models import JobConfig
from invest_assistant.modules.basic.stock_master.jobs import sync_stock_basic_job
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.basic.stock_master.service import build_a_stock_item
from invest_assistant.modules.basic.system_config.models import SystemConfig
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.market_radar.models import Tag
from invest_assistant.services.tushare.client import get_tushare_token


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_stock_import_and_search():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    response = client.post(
        "/api/stocks/import",
        json=[{"stock_code": "000001", "stock_name": "平安银行", "market": "A股", "exchange": "SZSE"}],
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()[0]["symbol"] == "000001.SZ"
    assert response.json()[0]["name_abbr"] == "payh"
    search = client.get("/api/stocks/search?keyword=平安", headers=headers)
    assert search.status_code == 200
    assert search.json()[0]["stock_name"] == "平安银行"
    db = SessionLocal()
    try:
        assert db.query(Tag).filter(Tag.type == "stock").count() == 0
    finally:
        db.close()


def test_stock_list_has_no_alias_workflow_after_tag_model_refactor():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    stock = client.post(
        "/api/stocks/import",
        json=[{"stock_code": "000001", "stock_name": "平安银行", "market": "MAIN", "exchange": "SZSE"}],
        headers=headers,
    ).json()[0]

    stocks = client.get("/api/stocks", headers=headers)
    assert stocks.status_code == 200
    assert "aliases" not in stocks.json()[0]
    removed = client.get(f"/api/stocks/{stock['id']}/aliases", headers=headers)
    assert removed.status_code == 404
    search = client.get("/api/stocks/search?keyword=payh", headers=headers)
    assert search.status_code == 200
    assert search.json()[0]["stock_name"] == "平安银行"
    edit = client.put(
        f"/api/stocks/{stock['id']}",
        json={"stock_name": "平安银行A", "status": "active"},
        headers=headers,
    )
    assert edit.status_code == 200
    db = SessionLocal()
    try:
        assert db.query(Tag).filter(Tag.type == "stock").count() == 0
    finally:
        db.close()


def test_build_a_stock_item_adds_symbol_market_and_pinyin():
    item = build_a_stock_item("300750", "宁德时代")

    assert item is not None
    assert item.stock_code == "300750"
    assert item.symbol == "300750.SZ"
    assert item.exchange == "SZSE"
    assert item.market == "GEM"
    assert item.name_pinyin == "ningdeshidai"
    assert item.name_abbr == "ndsd"


def test_sync_stock_basic_job_upserts_and_does_not_create_stock_tags(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        stale = Stock(
            symbol="600000.SH",
            stock_code="600000",
            stock_name="浦发银行",
            market="MAIN",
            exchange="SSE",
            status="active",
        )
        db.add(stale)
        db.commit()
    finally:
        db.close()

    first_tushare_rows = [
        {"ts_code": "000001.SZ", "symbol": "000001", "name": "平安银行"},
        {"ts_code": "600519.SH", "symbol": "600519", "name": "贵州茅台"},
        {"ts_code": "430047.BJ", "symbol": "430047", "name": "诺思兰德"},
    ]
    monkeypatch.setattr("invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_basic_rows", lambda: first_tushare_rows)
    monkeypatch.setattr(
        "invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_code_name_rows",
        lambda: (_ for _ in ()).throw(AssertionError("AkShare fallback should not be called")),
    )

    result = sync_stock_basic_job()

    assert result.success is True
    assert result.fetched_count == 3
    assert result.inserted_count == 3
    assert result.updated_count == 0
    assert result.extra == {
        "total": 3,
        "inserted": 3,
        "updated": 0,
        "disabled": 1,
        "sse": 1,
        "szse": 1,
        "bj": 1,
        "source": "tushare",
    }

    db = SessionLocal()
    try:
        ping_an = db.query(Stock).filter(Stock.stock_code == "000001", Stock.exchange == "SZSE").one()
        assert ping_an.symbol == "000001.SZ"
        assert ping_an.market == "MAIN"
        assert ping_an.name_pinyin == "pinganyinhang"
        assert ping_an.name_abbr == "payh"
        assert ping_an.status == "active"

        stale = db.query(Stock).filter(Stock.stock_code == "600000").one()
        assert stale.status == "disabled"

        assert db.query(Tag).filter(Tag.type == "stock").count() == 0
    finally:
        db.close()

    second_tushare_rows = [
        {"ts_code": "000001.SZ", "symbol": "000001", "name": "平安银行A"},
        {"ts_code": "600519.SH", "symbol": "600519", "name": "贵州茅台"},
        {"ts_code": "430047.BJ", "symbol": "430047", "name": "诺思兰德"},
    ]
    monkeypatch.setattr("invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_basic_rows", lambda: second_tushare_rows)

    result = sync_stock_basic_job()

    assert result.success is True
    assert result.inserted_count == 0
    assert result.updated_count == 3

    db = SessionLocal()
    try:
        ping_an = db.query(Stock).filter(Stock.stock_code == "000001", Stock.exchange == "SZSE").one()
        assert ping_an.stock_name == "平安银行A"
        assert db.query(Tag).filter(Tag.type == "stock").count() == 0
    finally:
        db.close()


def test_sync_stock_basic_job_falls_back_to_akshare_when_tushare_fails(monkeypatch):
    reset_db()
    def fail_tushare(**kwargs):
        raise RuntimeError("tushare unavailable")

    monkeypatch.setattr("invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_basic_rows", fail_tushare)
    monkeypatch.setattr("invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_code_name_rows", lambda: [{"code": "000001", "name": "平安银行"}])

    result = sync_stock_basic_job()

    assert result.success is True
    assert result.extra["source"] == "akshare"
    assert result.fetched_count == 1

    db = SessionLocal()
    try:
        stock = db.query(Stock).filter(Stock.stock_code == "000001", Stock.exchange == "SZSE").one()
        assert stock.stock_name == "平安银行"
    finally:
        db.close()


def test_sync_stock_basic_job_reads_tushare_token_from_system_config(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        db.add(
            SystemConfig(
                config_key="tushare-token",
                config_value="system-config-token",
                config_type="string",
                enabled=True,
            )
        )
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr("invest_assistant.services.tushare.client.get_settings", lambda: type("Settings", (), {"tushare_token": ""})())

    assert get_tushare_token() == "system-config-token"


def test_sync_stock_basic_job_failure_does_not_modify_existing_stocks(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        db.add(Stock(symbol="000001.SZ", stock_code="000001", stock_name="平安银行", market="MAIN", exchange="SZSE"))
        db.commit()
    finally:
        db.close()

    def fail_fetch():
        raise RuntimeError("upstream unavailable")

    monkeypatch.setattr("invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_basic_rows", fail_fetch)
    monkeypatch.setattr("invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_code_name_rows", fail_fetch)

    result = sync_stock_basic_job()

    assert result.success is False
    assert "upstream unavailable" in result.message

    db = SessionLocal()
    try:
        stocks = db.query(Stock).all()
        assert len(stocks) == 1
        assert stocks[0].stock_name == "平安银行"
        assert stocks[0].status == "active"
    finally:
        db.close()


def test_sync_stock_basic_job_empty_source_does_not_modify_existing_stocks(monkeypatch):
    reset_db()
    db = SessionLocal()
    try:
        db.add(Stock(symbol="000001.SZ", stock_code="000001", stock_name="平安银行", market="MAIN", exchange="SZSE"))
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr("invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_basic_rows", lambda: [])
    monkeypatch.setattr("invest_assistant.modules.basic.stock_master.jobs.fetch_a_stock_code_name_rows", lambda: [])

    result = sync_stock_basic_job()

    assert result.success is False
    assert "empty" in result.message

    db = SessionLocal()
    try:
        stocks = db.query(Stock).all()
        assert len(stocks) == 1
        assert stocks[0].status == "active"
    finally:
        db.close()


def test_system_config_crud():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    create = client.post(
        "/api/system-config",
        json={
            "config_key": "market_radar.heat_window",
            "config_value": "24h",
            "config_type": "string",
            "module_name": "market_radar",
            "description": "Market radar default heat window",
            "enabled": True,
        },
        headers=headers,
    )
    assert create.status_code == 200
    update = client.put(
        "/api/system-config/market_radar.heat_window",
        json={"config_value": "7d", "enabled": True},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["config_value"] == "7d"

    delete = client.delete("/api/system-config/market_radar.heat_window", headers=headers)
    assert delete.status_code == 204

    missing = client.get("/api/system-config/market_radar.heat_window", headers=headers)
    assert missing.status_code == 404


def test_console_data_sources_show_stock_master_and_cls_news():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    client.post(
        "/api/stocks/import",
        json=[{"stock_code": "000001", "stock_name": "平安银行", "market": "MAIN", "exchange": "SZSE"}],
        headers=headers,
    )
    db = SessionLocal()
    try:
        db.add(
            JobConfig(
                job_name="stock_master.sync_stock_basic",
                module_name="stock_master",
                display_name="同步股票基础库",
                config_json={},
                ext_json={},
                last_status="success",
                last_run_at=datetime(2026, 5, 21, 23, 12, 42),
            )
        )
        db.add(
            JobConfig(
                job_name="market_radar.fetch_news",
                module_name="market_radar",
                display_name="抓取市场新闻",
                config_json={},
                ext_json={},
                last_status="success",
                last_run_at=datetime(2026, 5, 21, 23, 40, 38),
            )
        )
        db.add(
            JobConfig(
                job_name="market_radar.fetch_futu_news",
                module_name="market_radar",
                display_name="抓取富途快讯",
                config_json={},
                ext_json={},
                last_status="success",
                last_run_at=datetime(2026, 5, 21, 23, 55, 12),
            )
        )
        db.add(
            JobConfig(
                job_name="market_radar.fetch_stock_news",
                module_name="market_radar",
                display_name="抓取个股新闻",
                config_json={},
                ext_json={},
                last_status="success",
                last_run_at=datetime(2026, 5, 21, 23, 58, 19),
            )
        )
        db.add(
            SourceItem(
                source_type="news",
                source_name="财联社",
                title="测试快讯",
                content="测试快讯",
            )
        )
        db.add(
            SourceItem(
                source_type="news",
                source_name="富途牛牛",
                title="测试富途快讯",
                content="测试富途快讯",
            )
        )
        db.add(
            SourceItem(
                source_type="news",
                source_name="东方财富",
                title="测试个股新闻",
                content="测试个股新闻",
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/console/data-sources", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert [item["name"] for item in data] == ["股票基础库", "信息流（财联社）", "信息流（富途牛牛）", "信息流（东方财富）"]
    assert data[0]["record_count"] == 1
    assert data[1]["record_count"] == 1
    assert data[2]["record_count"] == 1
    assert data[3]["record_count"] == 1
    assert data[0]["last_sync_at"].startswith("2026-05-21T23:12:42")
    assert data[1]["last_sync_at"].startswith("2026-05-21T23:40:38")
    assert data[2]["last_sync_at"].startswith("2026-05-21T23:55:12")
    assert data[3]["last_sync_at"].startswith("2026-05-21T23:58:19")


def test_report_library_creates_report_index():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    response = client.post(
        "/api/reports",
        json={
            "title": "阶段 1 测试报告",
            "report_type": "daily",
            "source_module": "system",
            "target_type": "market",
            "target_id": None,
            "summary": "test summary",
            "file_format": "md",
            "file_path": "reports/test.md",
            "generated_by": "manual",
            "status": "draft",
            "publish_time": None,
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "阶段 1 测试报告"


def test_disclosure_library_creates_index_without_fetching_file():
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    stock = client.post(
        "/api/stocks/import",
        json=[{"stock_code": "000001", "stock_name": "平安银行", "market": "A股", "exchange": "SZSE"}],
        headers=headers,
    ).json()[0]
    response = client.post(
        "/api/disclosures",
        json={
            "stock_id": stock["id"],
            "source": "cninfo",
            "disclosure_type": "announcement",
            "title": "测试公告",
            "publish_time": "2026-05-13T00:00:00",
            "report_period": "2026Q1",
            "source_url": "https://example.com/disclosure.pdf",
            "file_path": None,
            "parsed_text_path": None,
            "parsed_markdown_path": None,
            "parse_status": "pending",
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "测试公告"
