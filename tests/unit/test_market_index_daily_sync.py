"""大盘指数日线：每日增量同步、缓存不足时补齐约三年，MCP 只读缓存。全部用内存库。"""

from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import invest_assistant.modules.basic.report_library.models  # noqa: F401
import invest_assistant.modules.basic.stock_master.models  # noqa: F401
import invest_assistant.modules.market_radar.models  # noqa: F401
import invest_assistant.modules.stock_analysis.models  # noqa: F401
import invest_assistant.modules.track_discovery.models  # noqa: F401
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.stock_analysis import service as stock_service
from invest_assistant.modules.stock_analysis.models import MarketIndexDailyBar


def make_session():
    """内存库，不碰 var/db 下的任何文件。"""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def add_bar(db, code: str, day: date, close: float = 100.0) -> None:
    db.add(MarketIndexDailyBar(code=code, name=code, trade_date=day, open=close, high=close, low=close, close=close, source="tushare"))


def fake_fetch(calls: list):
    def fetch(code, *, start_date, end_date):
        calls.append((code, start_date))
        return [{"ts_code": code, "trade_date": end_date, "open": 1, "high": 1, "low": 1, "close": 1}]

    return fetch


def test_sync_backfills_short_cache_and_increments_full_cache(monkeypatch):
    db = make_session()
    today = date.today()
    # 沪深300 只有收益分析页补的一年，中证500 已有三年
    add_bar(db, "000300.SH", today - timedelta(days=300))
    add_bar(db, "000905.SH", today - timedelta(days=366 * 3))
    add_bar(db, "000905.SH", today - timedelta(days=2))
    db.commit()
    calls: list = []
    monkeypatch.setattr(stock_service.tushare_client, "fetch_market_index_daily_bar_rows", fake_fetch(calls))

    result = stock_service.sync_market_index_daily_bars(db, codes=("000300.SH", "000905.SH", "399006.SZ"), years=3)

    starts = dict(calls)
    three_years_ago = (today - timedelta(days=366 * 3)).strftime("%Y%m%d")
    assert starts["000300.SH"] == three_years_ago
    assert starts["399006.SZ"] == three_years_ago
    # 已够三年的从最后一天重取，不再从头拉
    assert starts["000905.SH"] == (today - timedelta(days=2)).strftime("%Y%m%d")
    assert result.success is True and result.processed_count == 3


def test_sync_reports_failed_index_and_keeps_others(monkeypatch):
    db = make_session()

    def fetch(code, *, start_date, end_date):
        if code == "000905.SH":
            raise RuntimeError("tushare is unavailable")
        return []

    monkeypatch.setattr(stock_service.tushare_client, "fetch_market_index_daily_bar_rows", fetch)

    result = stock_service.sync_market_index_daily_bars(db, codes=("000300.SH", "000905.SH"))

    assert result.success is False
    assert result.processed_count == 1
    assert "000905.SH" in result.message


def test_cached_index_bars_return_latest_in_ascending_order_and_never_fetch(monkeypatch):
    db = make_session()
    start = date(2026, 1, 5)
    for offset in range(5):
        add_bar(db, "000300.SH", start + timedelta(days=offset), close=100 + offset)
    db.commit()
    monkeypatch.setattr(
        stock_service.tushare_client,
        "fetch_market_index_daily_bar_rows",
        lambda *args, **kwargs: pytest.fail("只读缓存不能触发 Tushare"),
    )

    rows = stock_service.list_cached_market_index_daily_bars(db, "000300.sh", limit=3)

    assert [row.close for row in rows] == [102, 103, 104]
    with pytest.raises(ValueError, match="unsupported"):
        stock_service.list_cached_market_index_daily_bars(db, "000016.SH")


def test_mcp_index_bars_tool_allows_800_rows(monkeypatch):
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.tools.stock_analysis import get_index_daily_bars

    calls = {}

    def fake_list(db, code, *, start_date=None, end_date=None, limit=50):
        calls.update(code=code, limit=limit)
        return [{"trade_date": "2026-10-23", "close": 3850.0}]

    monkeypatch.setattr(
        "invest_assistant.modules.basic.mcp.tools.stock_analysis.stock_service.list_cached_market_index_daily_bars", fake_list
    )
    client = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["stock_analysis.get_index_daily_bars"],
        max_result_limit=50,
        local_only=True,
    )

    result = get_index_daily_bars(db=object(), client=client, limit=770)
    assert calls == {"code": "000300.SH", "limit": 770}
    assert result["items"] == [{"trade_date": "2026-10-23", "close": 3850.0}]

    get_index_daily_bars(db=object(), client=client, index_code="000905.SH", limit=5000)
    assert calls["limit"] == 800
