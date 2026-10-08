"""调仓来源复盘：按理由来源（AI 建议 / 个人判断 / 资金调配 / 其他）比较实际调仓的事后表现。

口径与微操建议评估一致，便于两边对照：
- 调仓日为 T（非交易日顺延到下一个交易日），按沪深300 日线数交易日，T+5 / T+20 / T+60 收盘评估，20 日为主判定。
- 收益在同一份前复权日线里算 close(T+N) / close(T) - 1。手填的调仓价是除权前的实际价，
  与前复权价不能直接相除，所以收益基准统一取 T 收盘。
- 加仓 20 日收益 > +1% 或减仓后 20 日跌超 1% 为 correct，反向超过 1% 为 wrong，其余 neutral。
- 公司行为（送转、配股、打新中签）不是主动判断，不计入。
每次查询现算，不落库：调仓记录量小，也免得多一个评估任务。
"""

from bisect import bisect_left
from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.portfolio.adjust_advice import (
    BENCHMARK_CODE,
    HORIZONS,
    _load_stock_series,
    _verdict,
)
from invest_assistant.modules.portfolio.models import Portfolio, PortfolioPositionChange
from invest_assistant.modules.stock_analysis.models import MarketIndexDailyBar

REVIEW_REASON_TYPES = ("ai_advice", "personal", "fund_allocation", "other", "unlabeled")


def review_position_changes(db: Session, portfolio_id: int | None = None, start_date: date | None = None) -> dict:
    stmt = select(PortfolioPositionChange).where(PortfolioPositionChange.quantity_delta != 0)
    if portfolio_id is not None:
        if db.get(Portfolio, portfolio_id) is None:
            raise FileNotFoundError(f"portfolio not found: {portfolio_id}")
        stmt = stmt.where(PortfolioPositionChange.portfolio_id == portfolio_id)
    if start_date is not None:
        stmt = stmt.where(PortfolioPositionChange.change_date >= start_date)
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
        stock_series = _load_stock_series(db, {change.stock_id for change in changes}, start)
        for change in changes:
            action = "add" if change.quantity_delta > 0 else "reduce"
            returns = _returns(change.change_date, trade_dates, stock_series.get(change.stock_id))
            groups[(change.reason_type or "unlabeled", action)].append(returns)

    rows = []
    for reason_type in REVIEW_REASON_TYPES:
        for action in ("add", "reduce"):
            samples = groups.get((reason_type, action))
            if samples:
                rows.append(_stat_row(reason_type, action, samples))
    return {
        "rules": (
            "以调仓日 T 收盘为基准（非交易日顺延），按交易日数到 T+5/T+20/T+60 收盘计算收益，20 日为主判定。"
            "加仓后 20 日涨超 1% 或减仓后 20 日跌超 1% 为对，反向超过 1% 为错，其余为平。"
            "公司行为不计入；收益基准统一取前复权收盘价，不用手填的调仓价。"
        ),
        "rows": rows,
    }


def _returns(change_date: date, trade_dates: list[date], series) -> dict[str, float | None]:
    result: dict[str, float | None] = {f"return_{horizon}d": None for horizon in HORIZONS}
    start_index = bisect_left(trade_dates, change_date)
    if series is None or start_index >= len(trade_dates):
        return result
    t_close = series.close_on_or_before(trade_dates[start_index])
    if not t_close:
        return result
    for horizon in HORIZONS:
        if start_index + horizon >= len(trade_dates):
            continue
        eval_day = trade_dates[start_index + horizon]
        if series.latest_date is None or series.latest_date < eval_day:
            continue
        result[f"return_{horizon}d"] = round(series.close_on_or_before(eval_day) / t_close - 1, 6)
    return result


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
    }
