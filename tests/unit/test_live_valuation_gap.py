from datetime import date

from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.stock_analysis.models import StockDailyBar, StockPoolItem, StockValuationSnapshot
from invest_assistant.modules.stock_analysis.service import get_stock_detail, list_pool

from tests.unit.test_stock_dashboard import make_session


def _bar(stock: Stock, day: date, close: float) -> StockDailyBar:
    return StockDailyBar(
        stock_id=stock.id, ts_code="600000.SH", trade_date=day, open=close, high=close, low=close, close=close
    )


def _seed(db, *, bars: list[tuple[date, float]]) -> Stock:
    stock = Stock(stock_code="600000", stock_name="浦发银行")
    db.add(stock)
    db.flush()
    db.add(StockPoolItem(stock_id=stock.id, status="watching"))
    db.add(
        StockValuationSnapshot(
            stock_id=stock.id,
            analysis_date=date(2026, 8, 3),
            current_market_value=100.0,
            expected_market_value_3y=200.0,
            expectation_gap_rate=1.0,
        )
    )
    db.add_all(_bar(stock, day, close) for day, close in bars)
    db.commit()
    return stock


def test_three_year_space_follows_latest_close():
    db = make_session()
    # 估值日 8/3 是周一但没有日线，取之前最近的 7/31 收盘 10 作为估值时的价格。
    stock = _seed(db, bars=[(date(2026, 7, 31), 10.0), (date(2026, 8, 4), 11.0), (date(2026, 10, 27), 12.5)])

    [row] = list_pool(db)
    assert row["expectation_gap_rate"] == 0.6

    valuation = get_stock_detail(db, stock.id)["latest_valuation"]
    assert valuation["current_market_value"] == 125.0
    assert valuation["expectation_gap_rate"] == 0.6
    # 估值历史保留快照当时的口径，不随股价改写。
    assert get_stock_detail(db, stock.id)["valuation_history"][-1]["expectation_gap_rate"] == 1.0


def test_three_year_space_falls_back_to_snapshot_without_bars_before_analysis_date():
    db = make_session()
    _seed(db, bars=[(date(2026, 8, 10), 12.0)])

    [row] = list_pool(db)
    assert row["expectation_gap_rate"] == 1.0
