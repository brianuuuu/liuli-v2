import sys
from datetime import date, timedelta
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.stock_analysis import service
from invest_assistant.modules.stock_analysis.models import MarketIndexDailyBar, StockDailyBar, StockPoolItem
from invest_assistant.services.tushare import client as tushare_client


def make_session(tmp_path):
    db_path = tmp_path / "stock_daily_bars.sqlite3"
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


def test_tushare_daily_bars_use_pro_bar_with_qfq_and_ma(monkeypatch):
    captured = {}

    class FakeFrame:
        columns = ["ts_code", "trade_date", "open", "high", "low", "close", "vol", "amount", "ma5", "ma20", "ma60", "ma250"]

        @property
        def empty(self):
            return False

        def iterrows(self):
            yield 0, {
                "ts_code": "000001.SZ",
                "trade_date": "20260605",
                "open": 10,
                "high": 11,
                "low": 9,
                "close": 10.5,
                "vol": 100,
                "amount": 1000,
                "ma5": 10.1,
                "ma20": 9.8,
                "ma60": 9.5,
                "ma250": 8.5,
            }

    def fake_pro_bar(**kwargs):
        captured.update(kwargs)
        return FakeFrame()

    fake_ts = SimpleNamespace(set_token=lambda token: None, pro_bar=fake_pro_bar)
    monkeypatch.setitem(sys.modules, "tushare", fake_ts)
    monkeypatch.setattr(tushare_client, "get_tushare_token", lambda: "token")

    rows = tushare_client.fetch_a_stock_daily_bar_rows(
        "000001.SZ",
        start_date="20260101",
        end_date="20260607",
        adj="qfq",
        ma=[5, 20, 60, 250],
    )

    assert captured["ts_code"] == "000001.SZ"
    assert captured["freq"] == "D"
    assert captured["adj"] == "qfq"
    assert captured["ma"] == [5, 20, 60, 250]
    assert rows[0]["ma250"] == 8.5


def test_refresh_stock_daily_bars_upserts_and_computes_missing_ma(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE", symbol="000001.SZ", status="active")
        db.add(stock)
        db.commit()

        start = date(2025, 1, 1)
        rows = [
            {
                "ts_code": "000001.SZ",
                "trade_date": (start + timedelta(days=index)).strftime("%Y%m%d"),
                "open": float(index + 1),
                "high": float(index + 2),
                "low": float(index),
                "close": float(index + 1),
                "vol": float(index + 10),
                "amount": float(index + 100),
            }
            for index in range(250)
        ]
        monkeypatch.setattr(service.tushare_client, "fetch_a_stock_daily_bar_rows", lambda *_args, **_kwargs: rows)

        first = service.refresh_stock_daily_bars(db, stock, years=3)
        second = service.refresh_stock_daily_bars(db, stock, years=3)
        bars = list(db.scalars(select(StockDailyBar).order_by(StockDailyBar.trade_date.asc())))

        assert first.inserted_count == 250
        assert second.inserted_count == 0
        assert second.updated_count == 250
        assert len(bars) == 250
        assert bars[-1].ma5 == 248.0
        assert bars[-1].ma20 == 240.5
        assert bars[-1].ma60 == 220.5
        assert bars[-1].ma250 == 125.5
    finally:
        db.close()


def test_sync_daily_bars_job_defaults_to_stock_pool_and_keeps_going(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        first = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE", symbol="000001.SZ", status="active")
        second = Stock(stock_code="600000", stock_name="浦发银行", exchange="SSE", symbol="600000.SH", status="active")
        db.add_all([first, second])
        db.commit()
        db.add_all([
            StockPoolItem(stock_id=first.id, status="focused", source="manual"),
            StockPoolItem(stock_id=second.id, status="watching", source="manual"),
        ])
        db.commit()

        calls = []

        def fake_refresh(db_arg, stock, **kwargs):
            calls.append(stock.stock_code)
            if stock.stock_code == "600000":
                raise RuntimeError("tushare unavailable")
            return SimpleNamespace(fetched_count=1, inserted_count=1, updated_count=0, skipped_count=0)

        monkeypatch.setattr(service, "refresh_stock_daily_bars", fake_refresh)

        result = service.sync_daily_bars(db, pool_status="focused,watching", max_stocks=10)

        assert result.success is True
        assert result.processed_count == 2
        assert result.inserted_count == 1
        assert result.skipped_count == 1
        assert calls == ["600000", "000001"] or calls == ["000001", "600000"]
        assert any(item["error"] == "tushare unavailable" for item in result.extra["per_stock"])
    finally:
        db.close()


def test_stock_daily_bars_job_is_registered():
    from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY

    job = JOB_REGISTRY["stock_analysis.sync_daily_bars"]
    assert job.display_name == "同步标的日线行情"
    assert job.cron_expr == "30 18 * * 1-5"
    assert job.params_schema["pool_status"]["default"] == "focused,watching,candidate"
    assert job.params_schema["max_stocks"]["default"] == 200


def test_refresh_market_index_daily_bars_upserts_without_stock_row(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        rows = [
            {
                "ts_code": "000300.SH",
                "trade_date": "20260102",
                "open": 3900.0,
                "high": 3920.0,
                "low": 3880.0,
                "close": 3910.0,
                "pre_close": 3890.0,
                "change": 20.0,
                "pct_chg": 0.5141,
                "vol": 1000.0,
                "amount": 2000.0,
            },
            {
                "ts_code": "000300.SH",
                "trade_date": "20260105",
                "open": 3910.0,
                "high": 3960.0,
                "low": 3900.0,
                "close": 3950.0,
                "pre_close": 3910.0,
                "change": 40.0,
                "pct_chg": 1.023,
                "vol": 1200.0,
                "amount": 2200.0,
            },
        ]
        captured = {}

        def fake_fetch(code, **kwargs):
            captured["code"] = code
            captured["kwargs"] = kwargs
            return rows

        monkeypatch.setattr(service.tushare_client, "fetch_market_index_daily_bar_rows", fake_fetch)

        first = service.refresh_market_index_daily_bars(
            db,
            "000300.SH",
            name="沪深300",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
        )
        second = service.refresh_market_index_daily_bars(
            db,
            "000300.SH",
            name="沪深300",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
        )
        bars = list(db.scalars(select(MarketIndexDailyBar).order_by(MarketIndexDailyBar.trade_date.asc())))

        assert captured["code"] == "000300.SH"
        assert captured["kwargs"] == {"start_date": "20260101", "end_date": "20260131"}
        assert first.inserted_count == 2
        assert first.updated_count == 0
        assert second.inserted_count == 0
        assert second.updated_count == 2
        assert len(bars) == 2
        assert bars[0].code == "000300.SH"
        assert bars[0].name == "沪深300"
        assert bars[0].close == 3910.0
    finally:
        db.close()
