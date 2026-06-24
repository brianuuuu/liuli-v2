from datetime import datetime
from types import SimpleNamespace
import sys

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.portfolio import service
from invest_assistant.modules.portfolio.models import PortfolioPosition
from invest_assistant.modules.portfolio.schemas import PortfolioCreate, PortfolioPositionCreate
from invest_assistant.services.tushare import client as tushare_client


def make_session(tmp_path):
    db_path = tmp_path / "portfolio_realtime.sqlite3"
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


def seed_stock(db, code="000001", name="平安银行", exchange="SZSE", symbol="000001.SZ"):
    stock = Stock(stock_code=code, stock_name=name, exchange=exchange, symbol=symbol, status="active")
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return stock


def test_create_or_update_position_uses_stock_and_quantity_without_cost(tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = seed_stock(db)
        portfolio = service.create_portfolio(db, PortfolioCreate(name="主实盘"), user_id=1)

        first = service.create_or_update_position(
            db,
            portfolio.id,
            PortfolioPositionCreate(stock_id=stock.id, quantity=100),
        )
        second = service.create_or_update_position(
            db,
            portfolio.id,
            PortfolioPositionCreate(stock_id=stock.id, quantity=150),
        )

        rows = list(db.scalars(select(PortfolioPosition).where(PortfolioPosition.portfolio_id == portfolio.id)))
        assert first.id == second.id
        assert len(rows) == 1
        assert rows[0].quantity == 150
        assert rows[0].cost_price is None
    finally:
        db.close()


def test_dashboard_computes_day_pnl_from_current_price_and_previous_close(tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = seed_stock(db)
        portfolio = service.create_portfolio(db, PortfolioCreate(name="主实盘"), user_id=1)
        position = service.create_or_update_position(
            db,
            portfolio.id,
            PortfolioPositionCreate(stock_id=stock.id, quantity=100),
        )
        position.current_price = 11
        position.previous_close = 10
        position.price_source = "tushare.realtime_quote"
        position.quote_time = datetime(2026, 6, 24, 10, 30)
        db.commit()

        dashboard = service.get_dashboard(db, portfolio.id)

        assert dashboard["summary"]["market_value"] == 1100
        assert dashboard["summary"]["previous_market_value"] == 1000
        assert dashboard["summary"]["day_pnl"] == 100
        assert dashboard["summary"]["day_pct"] == 10
        assert dashboard["positions"][0]["stock_name"] == "平安银行"
    finally:
        db.close()


def test_delete_portfolio_rejects_non_empty_portfolio(tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = seed_stock(db)
        empty = service.create_portfolio(db, PortfolioCreate(name="空组合"), user_id=1)
        non_empty = service.create_portfolio(db, PortfolioCreate(name="主实盘"), user_id=1)
        service.create_or_update_position(db, non_empty.id, PortfolioPositionCreate(stock_id=stock.id, quantity=100))

        assert service.delete_portfolio(db, empty.id) is True
        with pytest.raises(ValueError, match="non-empty portfolio cannot be deleted"):
            service.delete_portfolio(db, non_empty.id)
    finally:
        db.close()


def test_refresh_position_quotes_updates_successful_rows_and_reports_missing(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        first = seed_stock(db, code="000001", name="平安银行", exchange="SZSE", symbol="000001.SZ")
        second = seed_stock(db, code="600000", name="浦发银行", exchange="SSE", symbol="600000.SH")
        portfolio = service.create_portfolio(db, PortfolioCreate(name="主实盘"), user_id=1)
        service.create_or_update_position(db, portfolio.id, PortfolioPositionCreate(stock_id=first.id, quantity=100))
        service.create_or_update_position(db, portfolio.id, PortfolioPositionCreate(stock_id=second.id, quantity=50))
        monkeypatch.setattr(
            service.tushare_client,
            "fetch_realtime_quote_rows",
            lambda symbols: [
                {
                    "stock_code": "000001",
                    "price": 11.0,
                    "pre_close": 10.0,
                    "quote_time": datetime(2026, 6, 24, 10, 30),
                    "source": "tushare.realtime_quote",
                }
            ],
        )

        result = service.refresh_position_quotes(db, portfolio.id)
        dashboard = service.get_dashboard(db, portfolio.id)

        assert result["updated_count"] == 1
        assert result["warnings"] == [{"stock_code": "600000", "message": "quote not found"}]
        assert dashboard["summary"]["day_pnl"] == 100
        assert dashboard["positions"][0]["current_price"] == 11
    finally:
        db.close()


def test_refresh_position_quotes_raises_when_all_quotes_fail(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = seed_stock(db)
        portfolio = service.create_portfolio(db, PortfolioCreate(name="主实盘"), user_id=1)
        service.create_or_update_position(db, portfolio.id, PortfolioPositionCreate(stock_id=stock.id, quantity=100))

        def fail(_symbols):
            raise RuntimeError("tushare unavailable")

        monkeypatch.setattr(service.tushare_client, "fetch_realtime_quote_rows", fail)

        with pytest.raises(RuntimeError, match="tushare unavailable"):
            service.refresh_position_quotes(db, portfolio.id)
    finally:
        db.close()


def test_tushare_realtime_quotes_prefers_realtime_quote_and_normalizes(monkeypatch):
    captured = {}

    class FakeFrame:
        columns = ["name", "price", "pre_close", "date", "time", "code"]

        @property
        def empty(self):
            return False

        def iterrows(self):
            yield 0, {"name": "平安银行", "price": "11.20", "pre_close": "10.00", "date": "2026-06-24", "time": "10:30:00", "code": "000001"}

    def fake_realtime_quote(**kwargs):
        captured.update(kwargs)
        return FakeFrame()

    fake_ts = SimpleNamespace(set_token=lambda token: None, realtime_quote=fake_realtime_quote)
    monkeypatch.setitem(sys.modules, "tushare", fake_ts)
    monkeypatch.setattr(tushare_client, "get_tushare_token", lambda: "token")

    rows = tushare_client.fetch_realtime_quote_rows(["000001.SZ"])

    assert captured == {"ts_code": "000001.SZ"}
    assert rows == [
        {
            "stock_code": "000001",
            "price": 11.2,
            "pre_close": 10.0,
            "quote_time": datetime(2026, 6, 24, 10, 30),
            "source": "tushare.realtime_quote",
        }
    ]
