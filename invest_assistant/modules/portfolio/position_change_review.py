"""调仓来源复盘：按理由来源（AI 建议 / 个人判断 / 资金调配 / 其他）比较实际调仓的事后表现。

逐笔评价实际调仓，后续买卖不终止、不改变之前记录的评估：
- 调仓日为 T（非交易日顺延到下一个交易日），按沪深300 日线数交易日，T+5 / T+20 / T+60 收盘评估，20 日为主判定。
- 成交价先按 T 日前复权收盘 / 未复权收盘折到日线尺度，再算 close(T+N) / 折算成交价 - 1。
  缺价（含历史 estimated 记录）按 T 日未复权收盘估价；换算依据缺失时不计算收益。
- 增持后 20 日收益 > +1% 或减持后 20 日跌超 1% 为 correct，反向超过 1% 为 wrong，其余 neutral。
- 至今收益：没满 60 个交易日按最新收盘算（同时给出已过交易日数），满 60 日后固定为 T+60；
  T 日收盘后即可显示 0 日效果，只作参考，不参与对错和胜率。
- 公司行为（送转、配股、打新中签）不是主动判断，不计入。
- 金额：调仓金额 = |股数变化| × 调仓价（手填或按调仓日收盘估算；记价格之前的老记录在这里按同口径现算估价，不回写）；20 日影响 = 调仓金额 × 按方向折算的 20 日收益，
  即"增持后赚 / 亏了多少、减持后避开 / 错过了多少"，是相对不做这笔调仓的估算，不是已实现盈亏。
每次查询现算，不落库：调仓记录量小，也免得多一个评估任务。
"""

import logging
import math
from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.portfolio.adjust_advice import (
    BENCHMARK_CODE,
    HORIZONS,
    _load_stock_series,
    _verdict,
    advice_brief_by_item,
    changes_by_researcher,
)
from invest_assistant.modules.portfolio.models import Portfolio, PortfolioPositionChange
from invest_assistant.modules.stock_analysis.models import MarketIndexDailyBar
from invest_assistant.modules.stock_analysis.service import _stock_ts_code
from invest_assistant.services.tushare import client as tushare_client

logger = logging.getLogger(__name__)

REVIEW_REASON_TYPES = ("ai_advice", "personal", "fund_allocation", "other", "unlabeled")
# 至今收益最多算到最长评估期，满了就固定下来
TO_DATE_CAP_DAYS = HORIZONS[-1]


def review_position_changes(
    db: Session, portfolio_id: int | None = None, start_date: date | None = None, end_date: date | None = None,
    researcher_code: str | None = None,
) -> dict:
    if start_date is not None and end_date is not None and start_date > end_date:
        raise ValueError("开始日期不能晚于结束日期")
    stmt = select(PortfolioPositionChange).where(PortfolioPositionChange.quantity_delta != 0)
    if portfolio_id is not None:
        if db.get(Portfolio, portfolio_id) is None:
            raise FileNotFoundError(f"portfolio not found: {portfolio_id}")
        stmt = stmt.where(PortfolioPositionChange.portfolio_id == portfolio_id)
    if start_date is not None:
        stmt = stmt.where(PortfolioPositionChange.change_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(PortfolioPositionChange.change_date <= end_date)
    stmt = changes_by_researcher(stmt, researcher_code)
    changes = [change for change in db.scalars(stmt) if change.reason_type != "corporate_action"]

    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    if changes:
        start = min(change.change_date for change in changes)
        trade_dates = list(
            db.scalars(
                select(MarketIndexDailyBar.trade_date)
                .where(MarketIndexDailyBar.code == BENCHMARK_CODE, MarketIndexDailyBar.trade_date >= start)
                .order_by(MarketIndexDailyBar.trade_date.asc())
            )
        )
        stock_ids = {change.stock_id for change in changes}
        stock_series = _load_stock_series(db, stock_ids, start)
        stocks = {stock.id: stock for stock in db.scalars(select(Stock).where(Stock.id.in_(stock_ids)))}
        required_closes: dict[int, set[date]] = defaultdict(set)
        for change in changes:
            index = bisect_left(trade_dates, change.change_date)
            series = stock_series.get(change.stock_id)
            if index < len(trade_dates) and series is not None and series.bar_on(trade_dates[index]) is not None:
                required_closes[change.stock_id].add(trade_dates[index])
        raw_closes = _load_trade_closes(required_closes, stocks)
        portfolio_names = dict(db.execute(select(Portfolio.id, Portfolio.name)).all())
        advice = advice_brief_by_item(db, {change.advice_item_id for change in changes if change.advice_item_id})
        for change in sorted(changes, key=lambda item: (item.change_date, item.id), reverse=True):
            action = "add" if change.quantity_delta > 0 else "reduce"
            series = stock_series.get(change.stock_id)
            index = bisect_left(trade_dates, change.change_date)
            t_day = trade_dates[index] if index < len(trade_dates) else None
            raw_close = raw_closes.get((change.stock_id, t_day))
            price, price_source = _positive_price(change.price), change.price_source
            if change.price is None or price_source == "estimated":
                # 历史估算价可能保存的是当时的前复权收盘，不能当作实际成交价。
                price, price_source = raw_close, "estimated"
            returns = _returns(change.change_date, trade_dates, series, price=price, raw_close=raw_close)
            reason_type = change.reason_type or "unlabeled"
            groups[(reason_type, action)].append(
                _change_detail(
                    change, reason_type, action, returns, stocks.get(change.stock_id), portfolio_names, advice,
                    price=price, price_source=price_source,
                )
            )

    rows = []
    for reason_type in REVIEW_REASON_TYPES:
        for action in ("add", "reduce"):
            samples = groups.get((reason_type, action))
            if samples:
                rows.append(_stat_row(reason_type, action, samples))
    return {
        "rules": (
            "每笔以自身成交价为基准独立评估（非交易日顺延），后续买卖不改变此前记录。"
            "按交易日数到 T+5/T+20/T+60 收盘计算收益，20 日为主判定。"
            "增持后 20 日涨超 1% 或减持后 20 日跌超 1% 为对，反向超过 1% 为错，其余为平。"
            "至今收益未满 60 个交易日按最新收盘计算、满 60 日后固定为 T+60；当天收盘后可显示 0 日，只作过程参考，不参与判定。"
            "成交价按调仓日的前复权与未复权收盘比例换算；未填价按当日未复权收盘估算，换算依据缺失则收益留空。公司行为不计入。"
        ),
        "rows": rows,
    }


def _positive_price(value) -> float | None:
    try:
        price = float(value)
    except (TypeError, ValueError):
        return None
    return price if math.isfinite(price) and price > 0 else None


def _load_trade_closes(required: dict[int, set[date]], stocks: dict) -> dict[tuple[int, date], float]:
    """只读获取 T 日实际收盘；不调用会写库的日线刷新服务。"""
    if not required:
        return {}
    closes: dict[tuple[int, date], float] = {}
    for stock_id, days in required.items():
        stock = stocks.get(stock_id)
        if not days or stock is None:
            continue
        try:
            rows = tushare_client.fetch_a_stock_daily_bar_rows(
                _stock_ts_code(stock), start_date=min(days).strftime("%Y%m%d"),
                end_date=max(days).strftime("%Y%m%d"), adj=None,
            )
        except RuntimeError:
            logger.warning("调仓复盘未能获取未复权收盘价，stock_id=%s；相关收益留空", stock_id)
            continue
        for row in rows:
            try:
                day = datetime.strptime(str(row.get("trade_date", "")), "%Y%m%d").date()
            except ValueError:
                continue
            close = _positive_price(row.get("close"))
            if day in days and close is not None:
                closes[(stock_id, day)] = close
    return closes


def _returns(
    change_date: date, trade_dates: list[date], series, *, price: float | None, raw_close: float | None,
) -> dict[str, float | int | None]:
    result: dict[str, float | int | None] = {f"return_{horizon}d": None for horizon in HORIZONS}
    result.update(return_to_date=None, to_date_days=None)
    start_index = bisect_left(trade_dates, change_date)
    if series is None or start_index >= len(trade_dates):
        return result
    # 必须是 T 当天的行情，不能拿停牌前的价格换算这笔成交。
    t_bar = series.bar_on(trade_dates[start_index])
    t_close = _positive_price(t_bar.close) if t_bar is not None else None
    price, raw_close = _positive_price(price), _positive_price(raw_close)
    if t_close is None or price is None or raw_close is None:
        return result
    base_price = _positive_price(price * t_close / raw_close)
    if base_price is None:
        return result

    def return_on(day: date) -> float | None:
        close = _positive_price(series.close_on_or_before(day))
        return round(close / base_price - 1, 6) if close is not None else None

    if series.latest_date is not None:
        # 按个股最新一根日线算到第几个交易日，停牌时取此前最近收盘
        days = min(bisect_right(trade_dates, series.latest_date) - 1 - start_index, TO_DATE_CAP_DAYS)
        if days >= 0:
            result["return_to_date"] = return_on(trade_dates[start_index + days])
            result["to_date_days"] = days
    for horizon in HORIZONS:
        if start_index + horizon >= len(trade_dates):
            continue
        eval_day = trade_dates[start_index + horizon]
        if series.latest_date is None or series.latest_date < eval_day:
            continue
        result[f"return_{horizon}d"] = return_on(eval_day)
    return result


def _change_detail(
    change, reason_type: str, action: str, returns: dict, stock, portfolio_names: dict, advice: dict,
    *, price: float | None, price_source: str | None,
) -> dict:
    sign = 1 if action == "add" else -1
    amount = round(abs(change.quantity_delta) * price, 2) if price else None
    effect_20d = returns["return_20d"] * sign if returns["return_20d"] is not None else None
    brief = advice.get(change.advice_item_id) if change.advice_item_id else None
    return {
        **returns,
        "id": change.id,
        "reason_type": reason_type,
        "action": action,
        "change_date": change.change_date,
        "portfolio_id": change.portfolio_id,
        "portfolio_name": portfolio_names.get(change.portfolio_id),
        "stock_id": change.stock_id,
        "stock_code": stock.stock_code if stock else None,
        "stock_name": stock.stock_name if stock else None,
        "quantity_delta": change.quantity_delta,
        "price": price,
        "price_source": price_source,
        "amount": amount,
        "effect_5d": returns["return_5d"] * sign if returns["return_5d"] is not None else None,
        "effect_20d": effect_20d,
        "effect_60d": returns["return_60d"] * sign if returns["return_60d"] is not None else None,
        "effect_to_date": returns["return_to_date"] * sign if returns["return_to_date"] is not None else None,
        "impact_20d": round(amount * effect_20d, 2) if amount is not None and effect_20d is not None else None,
        "verdict": _verdict(action, returns["return_20d"]),
        "advice_item_id": change.advice_item_id,
        "advice_target_trade_date": brief["target_trade_date"] if brief else None,
        "researcher_code": brief.get("researcher_code") if brief else None,
        "researcher_name": brief.get("researcher_name") if brief else None,
    }


def _stat_row(reason_type: str, action: str, samples: list[dict]) -> dict:
    evaluated = [sample for sample in samples if sample["return_20d"] is not None]
    verdicts = [_verdict(action, sample["return_20d"]) for sample in evaluated]
    correct = verdicts.count("correct")
    sign = 1 if action == "add" else -1

    def average_effect(column: str) -> float | None:
        values = [sample[column] * sign for sample in samples if sample[column] is not None]
        return round(sum(values) / len(values), 6) if values else None

    return {
        "reason_type": reason_type,
        "action": action,
        "change_count": len(samples),
        "samples": len(evaluated),
        "correct": correct,
        "wrong": verdicts.count("wrong"),
        "neutral": verdicts.count("neutral"),
        "win_rate": round(correct / len(evaluated), 4) if evaluated else None,
        "avg_effect_5d": average_effect("return_5d"),
        "avg_effect_20d": average_effect("return_20d"),
        "avg_effect_60d": average_effect("return_60d"),
        "stock_count": len({sample["stock_id"] for sample in samples}),
        "amount": _sum_or_none(sample["amount"] for sample in samples),
        "impact_20d": _sum_or_none(sample["impact_20d"] for sample in samples),
        "changes": samples,
    }


def _sum_or_none(values) -> float | None:
    present = [value for value in values if value is not None]
    return round(sum(present), 2) if present else None
