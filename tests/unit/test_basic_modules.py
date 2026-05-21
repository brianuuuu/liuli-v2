import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
from fastapi.testclient import TestClient

test_db_path = Path(tempfile.gettempdir()) / "liuli_test_basic_modules.sqlite3"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path.as_posix()}"

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.stock_master.jobs import sync_stock_basic_job
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.basic.stock_master.service import build_a_stock_item
from invest_assistant.modules.market_radar.models import Tag


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
    search = client.get("/api/stocks/search?keyword=payh", headers=headers)
    assert search.status_code == 200
    assert search.json()[0]["stock_name"] == "平安银行"


def test_build_a_stock_item_adds_symbol_market_and_pinyin():
    item = build_a_stock_item("300750", "宁德时代")

    assert item is not None
    assert item.stock_code == "300750"
    assert item.symbol == "300750.SZ"
    assert item.exchange == "SZSE"
    assert item.market == "GEM"
    assert item.name_pinyin == "ningdeshidai"
    assert item.name_abbr == "ndsd"


def test_sync_stock_basic_job_upserts_disables_and_syncs_stock_tags(monkeypatch):
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

    first_df = pd.DataFrame(
        [
            {"code": "000001", "name": "平安银行"},
            {"code": "600519", "name": "贵州茅台"},
            {"code": "430047", "name": "诺思兰德"},
        ]
    )
    monkeypatch.setitem(sys.modules, "akshare", SimpleNamespace(stock_info_a_code_name=lambda: first_df))

    result = sync_stock_basic_job()

    assert result.success is True
    assert result.fetched_count == 3
    assert result.inserted_count == 3
    assert result.updated_count == 0
    assert result.extra == {"total": 3, "inserted": 3, "updated": 0, "disabled": 1, "sse": 1, "szse": 1, "bj": 1}

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

        tag = db.query(Tag).filter(Tag.type == "stock", Tag.stock_id == ping_an.id).one()
        assert tag.name == "平安银行"
        assert tag.status == "active"
    finally:
        db.close()

    second_df = pd.DataFrame(
        [
            {"code": "000001", "name": "平安银行A"},
            {"code": "600519", "name": "贵州茅台"},
            {"code": "430047", "name": "诺思兰德"},
        ]
    )
    monkeypatch.setitem(sys.modules, "akshare", SimpleNamespace(stock_info_a_code_name=lambda: second_df))

    result = sync_stock_basic_job()

    assert result.success is True
    assert result.inserted_count == 0
    assert result.updated_count == 3

    db = SessionLocal()
    try:
        ping_an = db.query(Stock).filter(Stock.stock_code == "000001", Stock.exchange == "SZSE").one()
        assert ping_an.stock_name == "平安银行A"
        tag = db.query(Tag).filter(Tag.type == "stock", Tag.stock_id == ping_an.id).one()
        assert tag.name == "平安银行A"
    finally:
        db.close()


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

    monkeypatch.setitem(sys.modules, "akshare", SimpleNamespace(stock_info_a_code_name=fail_fetch))

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

    monkeypatch.setitem(sys.modules, "akshare", SimpleNamespace(stock_info_a_code_name=lambda: pd.DataFrame(columns=["code", "name"])))

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
