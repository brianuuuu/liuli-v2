"""逐笔成交价复盘：只用内存对象和只读替身，不创建或修改数据库。"""

from datetime import date, timedelta
import sys
from types import SimpleNamespace

import pytest

from invest_assistant.modules.portfolio import position_change_review as review
from invest_assistant.modules.portfolio.adjust_advice import _StockSeries


T = date(2026, 11, 4)


def trading_days(count=70):
    days, day = [], T
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    return days


def series(closes, days=None):
    days = days or trading_days(len(closes))
    return _StockSeries([SimpleNamespace(trade_date=day, close=close) for day, close in zip(days, closes)])


def change(day=T, price=193.02, quantity=342, price_source="manual", id=1):
    return SimpleNamespace(
        id=id, stock_id=1, portfolio_id=1, change_date=day, price=price,
        price_source=price_source, quantity_delta=quantity, advice_item_id=None, reason_type="personal",
    )


def test_each_trade_uses_own_execution_price_without_pairing():
    days = trading_days(2)
    bars = series([230, 240], days)
    buy = review._returns(T, days, bars, price=193.02, raw_close=230)
    sell = review._returns(days[1], days, bars, price=242.22, raw_close=240)
    assert buy["return_to_date"] == round(240 / 193.02 - 1, 6)
    assert sell["return_to_date"] == round(240 / 242.22 - 1, 6)
    assert buy["to_date_days"] == 1
    assert sell["to_date_days"] == 0


def test_every_horizon_uses_execution_price_and_same_adjustment_scale():
    days = trading_days()
    # 除权后前复权尺度减半，实际成交价 100 对应复权价 50。
    bars = series([55 + i for i in range(70)], days)
    result = review._returns(T, days, bars, price=100, raw_close=110)
    for horizon in (5, 20, 60):
        assert result[f"return_{horizon}d"] == round((55 + horizon) / 50 - 1, 6)
    assert result["return_to_date"] == result["return_60d"]
    assert result["to_date_days"] == 60
    rescaled = review._returns(T, days, series([110 + 2 * i for i in range(70)], days), price=100, raw_close=110)
    assert rescaled == result


@pytest.mark.parametrize("price,raw_close", [(None, 100), (100, None), (0, 100), (100, 0), (-1, 100), (100, float("nan")), (float("inf"), 100)])
def test_missing_or_invalid_conversion_never_falls_back_to_close(price, raw_close):
    days = trading_days(2)
    result = review._returns(T, days, series([100, 110], days), price=price, raw_close=raw_close)
    assert all(value is None for value in result.values())


def test_same_day_requires_exact_trade_day_bar():
    days = trading_days(2)
    assert review._returns(T, days, series([110], days), price=100, raw_close=110)["return_to_date"] == 0.1
    # 没有调仓当天行情，不能用前一天收盘换算成交价。
    stale = series([100], [T - timedelta(days=1)])
    result = review._returns(T, days, stale, price=100, raw_close=100)
    assert all(value is None for value in result.values())


class ReadOnlyDB:
    def __init__(self, *results):
        self.results = iter(results)

    def scalars(self, statement):
        return iter(next(self.results))

    def execute(self, statement):
        return SimpleNamespace(all=lambda: [(1, "实盘")])


def test_raw_closes_batch_fetch_each_stock_date_range(monkeypatch):
    days = trading_days(3)
    calls = []

    def fetch(code, **kwargs):
        calls.append((code, kwargs))
        return [{"trade_date": days[1].strftime("%Y%m%d"), "close": 240}, {"trade_date": days[2].strftime("%Y%m%d"), "close": 250}]

    monkeypatch.setattr(review.tushare_client, "fetch_a_stock_daily_bar_rows", fetch)
    stocks = {1: SimpleNamespace(symbol="688627.SH")}
    needed = {1: {days[1], days[2]}}
    result = review._load_trade_closes(needed, stocks)
    assert result == {(1, days[1]): 240, (1, days[2]): 250}
    assert len(calls) == 1
    assert calls[0] == ("688627.SH", {"start_date": days[1].strftime("%Y%m%d"), "end_date": days[2].strftime("%Y%m%d"), "adj": None})


def test_raw_closes_do_not_fetch_when_no_dates_needed(monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail("无需换算日期时不应请求外部数据")

    monkeypatch.setattr(review.tushare_client, "fetch_a_stock_daily_bar_rows", unexpected)
    assert review._load_trade_closes({}, {}) == {}


def test_raw_closes_derive_tushare_code_for_legacy_stock_without_symbol(monkeypatch):
    calls = []

    def fetch(code, **kwargs):
        calls.append(code)
        return [{"trade_date": "20261104", "close": 230}]

    monkeypatch.setattr(review.tushare_client, "fetch_a_stock_daily_bar_rows", fetch)
    stocks = {1: SimpleNamespace(symbol=None, stock_code="688627", exchange="SSE")}
    assert review._load_trade_closes({1: {T}}, stocks) == {(1, T): 230}
    assert calls == ["688627.SH"]


def test_raw_close_fetch_failure_and_bad_rows_remain_missing(monkeypatch):
    def failing(*args, **kwargs):
        raise RuntimeError("unavailable")

    monkeypatch.setattr(review.tushare_client, "fetch_a_stock_daily_bar_rows", failing)
    stocks = {1: SimpleNamespace(symbol="688627.SH")}
    assert review._load_trade_closes({1: {T}}, stocks) == {}
    monkeypatch.setattr(review.tushare_client, "fetch_a_stock_daily_bar_rows", lambda *a, **k: [
        {"trade_date": "bad", "close": 10}, {"trade_date": "20261104", "close": float("nan")},
        {"trade_date": "20261104", "close": 0}, {"trade_date": "20261104", "close": -1},
    ])
    assert review._load_trade_closes({1: {T}}, stocks) == {}


def run_review(monkeypatch, changes, closes, raw_closes, **filters):
    days = trading_days(len(closes))
    stock = SimpleNamespace(id=1, stock_code="688627", stock_name="精智达", symbol="688627.SH")
    monkeypatch.setattr(review, "_load_stock_series", lambda *args: {1: series(closes, days)})
    monkeypatch.setattr(review, "_load_trade_closes", lambda *args: raw_closes)
    monkeypatch.setattr(review, "advice_brief_by_item", lambda *args: {})
    result = review.review_position_changes(ReadOnlyDB(changes, days, [stock]), **filters)
    return result, {row["action"]: row for row in result["rows"]}


def test_review_routes_each_price_and_updates_direction_amount_verdict_and_stats(monkeypatch):
    days = trading_days(22)
    changes = [change(price=100), change(days[1], price=130, quantity=-342, id=2)]
    _, rows = run_review(monkeypatch, changes, [120] * 22, {(1, T): 120, (1, days[1]): 120})
    add, reduce = rows["add"], rows["reduce"]
    for row, expected, price in [(add, 0.2, 100), (reduce, round(1 - 120 / 130, 6), 130)]:
        detail = row["changes"][0]
        assert detail["effect_to_date"] == pytest.approx(expected)
        assert detail["effect_20d"] == pytest.approx(expected)
        assert detail["amount"] == 342 * price
        assert detail["impact_20d"] == round(342 * price * expected, 2)
        assert detail["verdict"] == "correct"
        assert row["win_rate"] == 1
        assert row["avg_effect_20d"] == pytest.approx(expected)


@pytest.mark.parametrize("price,source", [(None, None), (50, "estimated")])
def test_missing_and_historical_estimated_price_use_raw_close_without_writes(monkeypatch, price, source):
    item = change(price=price, price_source=source)
    _, rows = run_review(monkeypatch, [item], [50, 55], {(1, T): 100})
    detail = rows["add"]["changes"][0]
    assert detail["price"] == 100
    assert detail["price_source"] == "estimated"
    assert detail["amount"] == 34200
    assert detail["effect_to_date"] == 0.1
    assert item.price == price and item.price_source == source


def test_missing_conversion_keeps_manual_price_but_excludes_evaluation(monkeypatch):
    _, rows = run_review(monkeypatch, [change(price=100)], [120] * 22, {})
    row = rows["add"]
    detail = row["changes"][0]
    assert detail["price"] == 100 and detail["amount"] == 34200
    assert detail["effect_to_date"] is None and detail["impact_20d"] is None
    assert detail["verdict"] is None
    assert row["samples"] == 0 and row["win_rate"] is None


@pytest.mark.parametrize("price,verdict", [(100, "wrong"), (120, "neutral")])
def test_reduce_wrong_and_neutral_use_execution_price(monkeypatch, price, verdict):
    _, rows = run_review(monkeypatch, [change(price=price, quantity=-342)], [120] * 22, {(1, T): 120})
    row = rows["reduce"]
    assert row["changes"][0]["verdict"] == verdict
    assert row[verdict] == 1 and row["win_rate"] == 0


def test_nontrading_date_moves_to_next_session_and_missing_series_stays_empty():
    monday = date(2026, 11, 9)
    days = [monday]
    result = review._returns(date(2026, 11, 8), days, series([110], days), price=100, raw_close=110)
    assert result["return_to_date"] == 0.1 and result["to_date_days"] == 0
    assert all(value is None for value in review._returns(T, [], None, price=100, raw_close=110).values())


def test_tushare_wrapper_passes_none_for_unadjusted_prices(monkeypatch):
    calls = []
    frame = SimpleNamespace(
        empty=False, columns={"trade_date", "open", "high", "low", "close"},
        iterrows=lambda: iter([(0, {"trade_date": "20261104", "open": 230, "high": 230, "low": 230, "close": 230})]),
    )

    def pro_bar(**kwargs):
        calls.append(kwargs)
        return frame

    monkeypatch.setattr(review.tushare_client, "get_tushare_token", lambda: "test-token")
    monkeypatch.setitem(sys.modules, "tushare", SimpleNamespace(set_token=lambda token: None, pro_bar=pro_bar))
    rows = review.tushare_client.fetch_a_stock_daily_bar_rows("688627.SH", start_date="20261104", end_date="20261104", adj=None)
    assert calls[0]["adj"] is None
    assert rows[0]["close"] == 230 and rows[0]["ts_code"] == "688627.SH"


def test_review_filters_trade_dates_inclusively_without_limiting_evaluation_dates():
    class QueryOnlyDB:
        def scalars(self, statement):
            self.sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
            return []

    db = QueryOnlyDB()
    result = review.review_position_changes(db, start_date=date(2026, 10, 5), end_date=T)
    assert "change_date >= '2026-10-05'" in db.sql
    assert "change_date <= '2026-11-04'" in db.sql
    assert "stock_daily_bar" not in db.sql
    assert result["rows"] == []


def test_review_rejects_reversed_range_before_any_database_access():
    with pytest.raises(ValueError, match="开始日期不能晚于结束日期"):
        review.review_position_changes(object(), start_date=T, end_date=T - timedelta(days=1))


def test_review_end_date_does_not_cap_the_trade_evaluation(monkeypatch):
    _, rows = run_review(monkeypatch, [change(price=100)], [120] * 22, {(1, T): 120}, start_date=T, end_date=T)
    detail = rows["add"]["changes"][0]
    assert detail["to_date_days"] == 21
    assert detail["effect_to_date"] == 0.2 and detail["effect_20d"] == 0.2


def test_review_route_forwards_date_range_and_reports_invalid_range(monkeypatch):
    from fastapi import HTTPException
    from invest_assistant.modules.portfolio import router

    calls = []

    def load(db, **kwargs):
        calls.append(kwargs)
        return {"rows": []}

    monkeypatch.setattr(review, "review_position_changes", load)
    assert router.review_position_changes(portfolio_id=1, start_date=T, end_date=T, db=object()) == {"rows": []}
    assert calls == [{"portfolio_id": 1, "start_date": T, "end_date": T}]

    def invalid(*args, **kwargs):
        raise ValueError("开始日期不能晚于结束日期")

    monkeypatch.setattr(review, "review_position_changes", invalid)
    with pytest.raises(HTTPException) as error:
        router.review_position_changes(start_date=T, end_date=T - timedelta(days=1), db=object())
    assert error.value.status_code == 422
