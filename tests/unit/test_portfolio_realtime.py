from datetime import date, datetime
from types import SimpleNamespace
import sys

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.portfolio import service
from invest_assistant.modules.portfolio import jobs
from invest_assistant.modules.portfolio.models import PortfolioPosition, PortfolioValueSnapshot
from invest_assistant.modules.portfolio.schemas import PortfolioCashFlowCreate, PortfolioCashUpdate, PortfolioCreate, PortfolioPositionCreate
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


def test_cash_flows_update_cash_balance_and_overview_totals(tmp_path):
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
        position.current_price = 10
        position.previous_close = 9
        db.commit()

        service.create_cash_flow(db, portfolio.id, PortfolioCashFlowCreate(flow_type="deposit", amount=1000, flow_date=date(2026, 1, 2)))
        service.create_cash_flow(db, portfolio.id, PortfolioCashFlowCreate(flow_type="withdraw", amount=200, flow_date=date(2026, 2, 2)))

        cash = service.get_cash_balance(db, portfolio.id)
        overview = service.get_overview(db, portfolio.id)

        assert cash["amount"] == 800
        assert overview["summary"]["position_market_value"] == 1000
        assert overview["summary"]["cash_amount"] == 800
        assert overview["summary"]["total_value"] == 1800
        assert overview["summary"]["year_pnl"] == 1000
        assert overview["allocation_rows"][0]["type"] == "total"
        assert overview["allocation_rows"][0]["market_value"] == 1000
        assert overview["allocation_rows"][0]["weight"] == 100
        assert any(row["type"] == "stock" and row["label"] == "平安银行" and row["market_value"] == 1000 for row in overview["allocation_rows"])
        assert all(row["type"] != "cash" for row in overview["allocation_rows"])
        assert overview["pie_items"] == [row for row in overview["allocation_rows"] if row["type"] == "stock"]
    finally:
        db.close()


def test_cash_adjustment_sets_cash_balance(tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        portfolio = service.create_portfolio(db, PortfolioCreate(name="现金组合"), user_id=1)

        service.update_cash_balance(db, portfolio.id, PortfolioCashUpdate(amount=300, note="初始现金"))
        service.create_cash_flow(db, portfolio.id, PortfolioCashFlowCreate(flow_type="adjustment", amount=450, flow_date=date(2026, 6, 25)))

        assert service.get_cash_balance(db, portfolio.id)["amount"] == 450
    finally:
        db.close()


def test_capture_daily_value_snapshot_is_idempotent_and_includes_cash(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = seed_stock(db)
        portfolio = service.create_portfolio(db, PortfolioCreate(name="主实盘"), user_id=1)
        service.create_or_update_position(db, portfolio.id, PortfolioPositionCreate(stock_id=stock.id, quantity=100))
        service.update_cash_balance(db, portfolio.id, PortfolioCashUpdate(amount=500))
        monkeypatch.setattr(
            service.tushare_client,
            "fetch_realtime_quote_rows",
            lambda symbols: [
                {
                    "stock_code": "000001",
                    "price": 12.0,
                    "pre_close": 10.0,
                    "quote_time": datetime(2026, 6, 25, 15, 0),
                    "source": "tushare.realtime_quote",
                }
            ],
        )

        first = service.capture_daily_value_snapshots(db, snapshot_date=date(2026, 6, 25), source="manual")
        second = service.capture_daily_value_snapshots(db, snapshot_date=date(2026, 6, 25), source="manual")
        snapshots = list(db.scalars(select(PortfolioValueSnapshot).where(PortfolioValueSnapshot.portfolio_id == portfolio.id)))

        assert first["processed_count"] == 1
        assert second["processed_count"] == 1
        assert len(snapshots) == 1
        assert snapshots[0].position_market_value == 1200
        assert snapshots[0].cash_amount == 500
        assert snapshots[0].total_value == 1700
        assert snapshots[0].source == "manual"
    finally:
        db.close()


def test_portfolio_snapshot_job_registered_for_daily_five_pm():
    definition = next(job for job in jobs.JOBS if job.job_name == "portfolio.capture_daily_value_snapshot")

    assert definition.module_name == "portfolio"
    assert definition.display_name == "保存组合每日市值快照"
    assert definition.trigger_type == "both"
    assert definition.cron_expr == "0 17 * * *"
