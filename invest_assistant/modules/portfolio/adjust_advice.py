"""微操建议：研究回流「微操报告」的落库、事后评估与复盘统计。

评估口径与 portfolio_001 profile 一致：
- 以适用交易日 T 为锚，按沪深300 日线数交易日（指数日线即交易日历），T+5 / T+20 / T+60 收盘评估，20 日为主判定。
- 收益一律在同一份前复权日线里计算：close(T+N) / close(T) - 1。缓存只有前复权价，
  建议里的价格区间是当时的实际价，分红除权后两者无法换算，所以收益基准统一取 T 收盘，
  价格是否触及区间只决定这条建议是否计入胜率。
- 只评估增持、减持，以及 warning 及以上的风险警示；没有警示的维持、等待不算收益。
"""

import json
from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.alert_center import service as alert_service
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.portfolio.models import (
    Portfolio,
    PortfolioAdjustAdvice,
    PortfolioAdjustAdviceItem,
    PortfolioPositionChange,
)
from invest_assistant.modules.stock_analysis.models import MarketIndexDailyBar, StockDailyBar
from invest_assistant.shared.time_utils import utc_now

ACTIONS = {"add", "reduce", "hold", "wait"}
DIRECTIONAL_ACTIONS = {"add", "reduce"}
SIGNAL_CATEGORIES = {
    "below_value_center": "value",
    "above_value_center": "value",
    "value_rank_mismatch": "allocation",
    "concentration_risk": "allocation",
    "cash_rebalance": "allocation",
    "value_impairment_risk": "risk",
    "pullback_support": "timing",
    "overextension": "timing",
    "sentiment_extreme": "timing",
}
RISK_CODES = {
    "kline_breakdown",
    "value_trend_down",
    "relative_weakness",
    "volatility_spike",
    "negative_sentiment",
    "fundamental_deterioration",
    "regulatory_legal",
    "shareholder_action",
    "event_window",
}
RISK_LEVELS = {"none", "watch", "warning", "severe"}
ALERT_RISK_LEVELS = {"warning": "warning", "severe": "critical"}
RISK_LEVEL_LABELS = {"warning": "警示", "severe": "严重"}
VALUE_ZONES = {"deep_below", "below", "around", "above", "far_above"}
LONG_TRENDS = {"up", "flat", "down"}

BENCHMARK_CODE = "000300.SH"
HORIZONS = (5, 20, 60)
VERDICT_THRESHOLD = 0.01
RISK_HIT_EXCESS = -0.03


# ---------------------------------------------------------------------------
# 导入
# ---------------------------------------------------------------------------


def import_advice(
    db: Session,
    payload: dict,
    *,
    feedback_id: int,
    report_id: int | None,
    researcher_code: str | None,
) -> PortfolioAdjustAdvice:
    """把报告末尾 JSON 落成 ① ②，warning 及以上同时发预警。不提交，由调用方与回流状态一起提交。"""
    if db.scalar(select(PortfolioAdjustAdvice.id).where(PortfolioAdjustAdvice.feedback_id == feedback_id)) is not None:
        raise ValueError("该微操报告已导入，不能重复导入")
    portfolio = _resolve_portfolio(db, payload.get("portfolio_id"))
    target_trade_date = _required_date(payload, "target_trade_date")
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("微操报告缺少字段: items（必须是数组）")
    code = _optional_text(payload.get("researcher_code")) or _optional_text(researcher_code)
    snapshot = payload.get("snapshot") if isinstance(payload.get("snapshot"), dict) else {}

    for previous in db.scalars(
        select(PortfolioAdjustAdvice).where(
            PortfolioAdjustAdvice.portfolio_id == portfolio.id,
            PortfolioAdjustAdvice.researcher_code == code,
            PortfolioAdjustAdvice.target_trade_date == target_trade_date,
            PortfolioAdjustAdvice.status == "active",
        )
    ):
        previous.status = "superseded"

    advice = PortfolioAdjustAdvice(
        portfolio_id=portfolio.id,
        feedback_id=feedback_id,
        report_id=report_id,
        researcher_code=code,
        data_as_of_date=_required_date(payload, "data_as_of_date"),
        news_as_of=_optional_datetime(payload.get("news_as_of")),
        target_trade_date=target_trade_date,
        has_opportunity=payload.get("has_opportunity") if isinstance(payload.get("has_opportunity"), bool) else None,
        total_asset=_optional_float(snapshot.get("total_asset")),
        cash=_optional_float(snapshot.get("cash")),
        cash_ratio_before=_optional_float(payload.get("cash_ratio_before")),
        cash_ratio_after=_optional_float(payload.get("cash_ratio_after")),
        continuity_note=_optional_text(payload.get("continuity_note")),
        status="active",
    )
    db.add(advice)
    db.flush()
    for index, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            raise ValueError(f"items 第 {index + 1} 项必须是 JSON 对象")
        item, stock = _build_item(db, advice.id, raw, index)
        db.add(item)
        if item.risk_level in ALERT_RISK_LEVELS:
            item.alert_event_id = _create_risk_alert(db, stock, raw, item.risk_level, target_trade_date)
    db.flush()
    return advice


def _build_item(db: Session, advice_id: int, raw: dict, index: int) -> tuple[PortfolioAdjustAdviceItem, Stock]:
    label = f"items 第 {index + 1} 项"
    stock = _resolve_stock(db, raw.get("company_code"), label)
    label = f"{label}（{stock.stock_name}）"
    action = str(raw.get("action") or "").strip()
    if action not in ACTIONS:
        raise ValueError(f"{label} action 取值无效: {action or '空'}，只能是 add / reduce / hold / wait")
    price_low = _optional_float(raw.get("price_low"))
    price_high = _optional_float(raw.get("price_high"))
    if action in DIRECTIONAL_ACTIONS and (price_low is None or price_high is None):
        raise ValueError(f"{label} 增持、减持必须给出 price_low 和 price_high")
    rating = _optional_int(raw.get("rating"))
    value_position = raw.get("value_position") if isinstance(raw.get("value_position"), dict) else {}
    risk_alert = raw.get("risk_alert") if isinstance(raw.get("risk_alert"), dict) else {}
    risk_level = str(risk_alert.get("risk_level") or "none").strip()
    bias60_pct = _optional_float(value_position.get("bias60_pct"))
    item = PortfolioAdjustAdviceItem(
        advice_id=advice_id,
        stock_id=stock.id,
        action=action,
        rating=rating if rating is not None and 1 <= rating <= 5 else None,
        quantity=_optional_float(raw.get("quantity")),
        quantity_before=_optional_float(raw.get("quantity_before")),
        price_low=price_low,
        price_high=price_high,
        primary_signal_code=_first_known(raw.get("signal_codes"), SIGNAL_CATEGORIES),
        value_zone=_enum_or_none(value_position.get("value_zone"), VALUE_ZONES),
        long_trend=_enum_or_none(value_position.get("long_trend"), LONG_TRENDS),
        bias60_pct=bias60_pct if bias60_pct is not None and 0 <= bias60_pct <= 1 else None,
        risk_level=risk_level if risk_level in RISK_LEVELS else "none",
        primary_risk_code=_first_known(risk_alert.get("risk_codes"), RISK_CODES),
        detail_json=json.dumps(raw, ensure_ascii=False),
    )
    return item, stock


def _create_risk_alert(db: Session, stock: Stock, raw: dict, risk_level: str, target_trade_date: date) -> int:
    risk_alert = raw.get("risk_alert") if isinstance(raw.get("risk_alert"), dict) else {}
    parts = [f"{RISK_LEVEL_LABELS[risk_level]}：{_optional_text(risk_alert.get('summary')) or '研究员未给出风险说明'}"]
    implication = _optional_text(risk_alert.get("implication"))
    if implication:
        parts.append(f"对仓位的含义：{implication}")
    parts.append(f"适用交易日 {target_trade_date.isoformat()}")
    event = alert_service.create_event(
        db,
        title=f"微操风险{RISK_LEVEL_LABELS[risk_level]}｜{stock.stock_name}（{stock.stock_code}）",
        message="。".join(parts) + "。",
        event_level=ALERT_RISK_LEVELS[risk_level],
    )
    return event.id


def _resolve_portfolio(db: Session, value: Any) -> Portfolio:
    if value is not None and not (isinstance(value, str) and not value.strip()):
        try:
            portfolio_id = int(value)
        except Exception as exc:
            raise ValueError("portfolio_id 必须是整数") from exc
        portfolio = db.get(Portfolio, portfolio_id)
        if portfolio is None:
            raise ValueError(f"未找到组合: portfolio_id={portfolio_id}")
        return portfolio
    portfolios = list(db.scalars(select(Portfolio).limit(2)))
    if len(portfolios) != 1:
        raise ValueError("微操报告缺少字段: portfolio_id（存在多个组合时必须指定）")
    return portfolios[0]


def _resolve_stock(db: Session, value: Any, label: str) -> Stock:
    code = str(value or "").strip().upper().split(".")[0]
    if not code:
        raise ValueError(f"{label} 缺少字段: company_code")
    rows = list(db.scalars(select(Stock).where(Stock.stock_code == code).limit(2)))
    if not rows:
        raise ValueError(f"{label} 未找到股票: {code}")
    if len(rows) > 1:
        raise ValueError(f"{label} 匹配到多个股票: {code}")
    return rows[0]


# ---------------------------------------------------------------------------
# 评估
# ---------------------------------------------------------------------------


def evaluate_adjust_advice(db: Session) -> dict:
    """评估所有到期未算完的条目。可重复执行：数据没到的条目跳过，下次运行自动补上。"""
    rows = db.execute(
        select(PortfolioAdjustAdviceItem, PortfolioAdjustAdvice)
        .join(PortfolioAdjustAdvice, PortfolioAdjustAdvice.id == PortfolioAdjustAdviceItem.advice_id)
        .where(
            PortfolioAdjustAdvice.status == "active",
            PortfolioAdjustAdviceItem.return_60d.is_(None),
            (PortfolioAdjustAdviceItem.action.in_(DIRECTIONAL_ACTIONS))
            | (PortfolioAdjustAdviceItem.risk_level.in_(ALERT_RISK_LEVELS)),
        )
    ).all()
    if not rows:
        return {"processed_count": 0, "updated_count": 0}
    start = min(advice.target_trade_date for _, advice in rows)
    # 只读缓存，不触发 Tushare 拉取：指数日线由行情任务维护，没到的数据下次运行再算
    index_bars = db.scalars(
        select(MarketIndexDailyBar)
        .where(MarketIndexDailyBar.code == BENCHMARK_CODE, MarketIndexDailyBar.trade_date >= start)
        .order_by(MarketIndexDailyBar.trade_date.asc(), MarketIndexDailyBar.id.asc())
    ).all()
    trade_dates = [bar.trade_date for bar in index_bars]
    benchmark_close = {bar.trade_date: bar.close for bar in index_bars}
    stock_series = _load_stock_series(db, {item.stock_id for item, _ in rows}, start)

    updated = 0
    for item, advice in rows:
        if _evaluate_item(db, item, advice, trade_dates, benchmark_close, stock_series.get(item.stock_id)):
            item.evaluated_at = utc_now()
            updated += 1
    db.commit()
    return {"processed_count": len(rows), "updated_count": updated}


class _StockSeries:
    def __init__(self, bars: list[StockDailyBar]):
        self.dates = [bar.trade_date for bar in bars]
        self.bars = bars

    @property
    def latest_date(self) -> date | None:
        return self.dates[-1] if self.dates else None

    def bar_on(self, day: date) -> StockDailyBar | None:
        position = bisect_right(self.dates, day) - 1
        return self.bars[position] if position >= 0 and self.dates[position] == day else None

    def close_on_or_before(self, day: date) -> float | None:
        position = bisect_right(self.dates, day) - 1
        return self.bars[position].close if position >= 0 else None


def _load_stock_series(db: Session, stock_ids: set[int], start: date) -> dict[int, _StockSeries]:
    grouped: dict[int, list[StockDailyBar]] = defaultdict(list)
    bars = db.scalars(
        select(StockDailyBar)
        .where(
            StockDailyBar.stock_id.in_(stock_ids),
            StockDailyBar.adj == "qfq",
            StockDailyBar.source == "tushare",
            # 往前多取一段：T 当日停牌时要用此前最近的收盘价
            StockDailyBar.trade_date >= start - timedelta(days=30),
        )
        .order_by(StockDailyBar.trade_date.asc(), StockDailyBar.id.asc())
    )
    for bar in bars:
        grouped[bar.stock_id].append(bar)
    return {stock_id: _StockSeries(items) for stock_id, items in grouped.items()}


def _evaluate_item(
    db: Session,
    item: PortfolioAdjustAdviceItem,
    advice: PortfolioAdjustAdvice,
    trade_dates: list[date],
    benchmark_close: dict[date, float],
    series: _StockSeries | None,
) -> bool:
    start_index = bisect_left(trade_dates, advice.target_trade_date)
    if series is None or start_index >= len(trade_dates):
        return False
    t_day = trade_dates[start_index]
    # 个股日线还没同步到 T（而不是停牌）时整条跳过，等下次运行
    if series.latest_date is None or series.latest_date < t_day:
        return False
    t_close = series.close_on_or_before(t_day)
    if not t_close:
        return False

    changed = False
    if item.trigger_status is None:
        _fill_trigger_and_execution(db, item, advice, t_day, series.bar_on(t_day), t_close)
        changed = True
    for horizon in HORIZONS:
        column = f"return_{horizon}d"
        if getattr(item, column) is not None or start_index + horizon >= len(trade_dates):
            continue
        eval_day = trade_dates[start_index + horizon]
        if series.latest_date < eval_day:
            continue
        setattr(item, column, round(series.close_on_or_before(eval_day) / t_close - 1, 6))
        changed = True
        if horizon == 20:
            base = benchmark_close.get(t_day)
            item.benchmark_return_20d = round(benchmark_close[eval_day] / base - 1, 6) if base else None
            item.verdict = _verdict(item.action, item.return_20d)
            item.risk_verdict = _risk_verdict(item)
    return changed



def _fill_trigger_and_execution(
    db: Session,
    item: PortfolioAdjustAdviceItem,
    advice: PortfolioAdjustAdvice,
    t_day: date,
    t_bar: StockDailyBar | None,
    t_close: float,
) -> None:
    item.base_price = t_close
    if item.action not in DIRECTIONAL_ACTIONS:
        item.trigger_status = "n_a"
        return
    if t_bar is None:
        touched = False  # T 当日停牌
    elif item.action == "add":
        touched = t_bar.low <= item.price_high
    else:
        touched = t_bar.high >= item.price_low
    item.trigger_status = "touched" if touched else "not_touched"

    deltas = db.scalars(
        select(PortfolioPositionChange.quantity_delta).where(
            PortfolioPositionChange.portfolio_id == advice.portfolio_id,
            PortfolioPositionChange.stock_id == item.stock_id,
            PortfolioPositionChange.change_date == t_day,
        )
    ).all()
    sign = 1 if item.action == "add" else -1
    executed = sum(delta * sign for delta in deltas if delta * sign > 0)
    item.executed_quantity = executed
    if executed <= 0:
        item.execution_status = "not_executed"
    elif item.quantity is None or executed >= item.quantity * 0.999:
        item.execution_status = "executed"
    else:
        item.execution_status = "partial"


def _verdict(action: str, return_20d: float | None) -> str | None:
    if action not in DIRECTIONAL_ACTIONS or return_20d is None:
        return None
    effect = return_20d if action == "add" else -return_20d
    if effect > VERDICT_THRESHOLD:
        return "correct"
    if effect < -VERDICT_THRESHOLD:
        return "wrong"
    return "neutral"


def _risk_verdict(item: PortfolioAdjustAdviceItem) -> str | None:
    if item.risk_level not in ALERT_RISK_LEVELS or item.return_20d is None or item.benchmark_return_20d is None:
        return None
    return "hit" if item.return_20d - item.benchmark_return_20d < RISK_HIT_EXCESS else "miss"


# ---------------------------------------------------------------------------
# 复盘回读
# ---------------------------------------------------------------------------


def list_adjust_advice_reviews(db: Session, portfolio_id: int | None = None, limit: int = 10) -> dict:
    """最近 N 份微操报告及评估结果，外加基于全部历史的胜率与警示命中率统计。"""
    stmt = select(PortfolioAdjustAdvice).where(PortfolioAdjustAdvice.status == "active")
    if portfolio_id is not None:
        if db.get(Portfolio, portfolio_id) is None:
            raise FileNotFoundError(f"portfolio not found: {portfolio_id}")
        stmt = stmt.where(PortfolioAdjustAdvice.portfolio_id == portfolio_id)
    advices = list(db.scalars(stmt.order_by(PortfolioAdjustAdvice.target_trade_date.asc(), PortfolioAdjustAdvice.id.asc())))
    items_by_advice: dict[int, list[tuple[PortfolioAdjustAdviceItem, Stock]]] = defaultdict(list)
    if advices:
        for item, stock in db.execute(
            select(PortfolioAdjustAdviceItem, Stock)
            .join(Stock, Stock.id == PortfolioAdjustAdviceItem.stock_id)
            .where(PortfolioAdjustAdviceItem.advice_id.in_([advice.id for advice in advices]))
            .order_by(PortfolioAdjustAdviceItem.id.asc())
        ):
            items_by_advice[item.advice_id].append((item, stock))
    recent = list(reversed(advices))[: max(1, int(limit))]
    return {
        "rules": (
            "以适用交易日 T 收盘为基准，按交易日数到 T+5/T+20/T+60 收盘计算收益，20 日为主判定。"
            "增持收益 > +1% 或减持后跌超 1% 为 correct，反向超过 1% 为 wrong，其余 neutral。"
            "胜率只统计价格触及区间的建议，连续多日对同一标的的同方向未执行建议只算一次。"
            "warning 及以上警示 20 日跑输沪深300 超过 3% 为 hit。"
        ),
        "summary": _summary(advices, items_by_advice),
        "reports": [_advice_dict(advice, items_by_advice[advice.id]) for advice in recent],
        "signal_stats": _signal_stats(advices, items_by_advice),
        "risk_stats": _risk_stats(advices, items_by_advice),
    }


def advice_dict(db: Session, advice: PortfolioAdjustAdvice) -> dict:
    rows = db.execute(
        select(PortfolioAdjustAdviceItem, Stock)
        .join(Stock, Stock.id == PortfolioAdjustAdviceItem.stock_id)
        .where(PortfolioAdjustAdviceItem.advice_id == advice.id)
        .order_by(PortfolioAdjustAdviceItem.id.asc())
    ).all()
    return _advice_dict(advice, [(item, stock) for item, stock in rows])


def _advice_dict(advice: PortfolioAdjustAdvice, rows: list[tuple[PortfolioAdjustAdviceItem, Stock]]) -> dict:
    return {
        "id": advice.id,
        "portfolio_id": advice.portfolio_id,
        "report_id": advice.report_id,
        "researcher_code": advice.researcher_code,
        "data_as_of_date": advice.data_as_of_date,
        "target_trade_date": advice.target_trade_date,
        "has_opportunity": advice.has_opportunity,
        "continuity_note": advice.continuity_note,
        "items": [_item_dict(item, stock) for item, stock in rows],
    }


def _item_dict(item: PortfolioAdjustAdviceItem, stock: Stock) -> dict:
    detail = _loads(item.detail_json)
    risk_alert = detail.get("risk_alert") if isinstance(detail.get("risk_alert"), dict) else {}
    return {
        "id": item.id,
        "stock_id": item.stock_id,
        "stock_code": stock.stock_code,
        "stock_name": stock.stock_name,
        "action": item.action,
        "rating": item.rating,
        "quantity": item.quantity,
        "price_low": item.price_low,
        "price_high": item.price_high,
        "primary_signal_code": item.primary_signal_code,
        "value_zone": item.value_zone,
        "long_trend": item.long_trend,
        "bias60_pct": item.bias60_pct,
        "core_logic": detail.get("core_logic"),
        "history_note": detail.get("history_note"),
        "risk_level": item.risk_level,
        "primary_risk_code": item.primary_risk_code,
        "risk_summary": risk_alert.get("summary"),
        "trigger_status": item.trigger_status,
        "execution_status": item.execution_status,
        "executed_quantity": item.executed_quantity,
        "base_price": item.base_price,
        "return_5d": item.return_5d,
        "return_20d": item.return_20d,
        "return_60d": item.return_60d,
        "benchmark_return_20d": item.benchmark_return_20d,
        "verdict": item.verdict,
        "risk_verdict": item.risk_verdict,
    }


def _summary(advices: list[PortfolioAdjustAdvice], items_by_advice: dict) -> dict:
    """全部历史上的执行与待评估概况；胜率口径见 signal_stats。"""
    directional = [
        item for advice in advices for item, _stock in items_by_advice.get(advice.id, []) if item.action in DIRECTIONAL_ACTIONS
    ]
    alerts = [
        item for advice in advices for item, _stock in items_by_advice.get(advice.id, []) if item.risk_level in ALERT_RISK_LEVELS
    ]
    tracked = [item for item in directional if item.execution_status is not None]
    return {
        "report_count": len(advices),
        "advice_count": len(directional),
        "executed_count": sum(1 for item in tracked if item.execution_status in {"executed", "partial"}),
        "tracked_count": len(tracked),
        "pending_count": sum(1 for item in directional if item.verdict is None),
        "alert_count": len(alerts),
    }


def _signal_stats(advices: list[PortfolioAdjustAdvice], items_by_advice: dict) -> dict:
    by_signal: dict[tuple[str, str], list[PortfolioAdjustAdviceItem]] = defaultdict(list)
    by_category: dict[tuple[str, str], list[PortfolioAdjustAdviceItem]] = defaultdict(list)
    for item in _episode_samples(advices, items_by_advice):
        signal = item.primary_signal_code or "unknown"
        by_signal[(item.action, signal)].append(item)
        by_category[(item.action, SIGNAL_CATEGORIES.get(signal, "unknown"))].append(item)
    return {
        "by_signal": [_win_rate_row("signal_code", key, rows) for key, rows in sorted(by_signal.items())],
        "by_category": [_win_rate_row("category", key, rows) for key, rows in sorted(by_category.items())],
    }


def _episode_samples(advices: list[PortfolioAdjustAdvice], items_by_advice: dict) -> list[PortfolioAdjustAdviceItem]:
    """连续多份报告对同一标的给出同方向、且一直未执行的建议，视为同一次判断，取其中第一条触及区间的计入。"""
    samples: list[PortfolioAdjustAdviceItem] = []
    open_episodes: dict[tuple[int, int], dict] = {}
    previous_by_portfolio: dict[int, dict[int, PortfolioAdjustAdviceItem]] = {}
    for advice in advices:
        previous = previous_by_portfolio.get(advice.portfolio_id, {})
        current: dict[int, PortfolioAdjustAdviceItem] = {}
        for item, _stock in items_by_advice.get(advice.id, []):
            current[item.stock_id] = item
            if item.action not in DIRECTIONAL_ACTIONS:
                continue
            key = (advice.portfolio_id, item.stock_id)
            last = previous.get(item.stock_id)
            continues = (
                last is not None
                and last.action == item.action
                and last.execution_status not in {"executed", "partial"}
                and key in open_episodes
            )
            if not continues:
                open_episodes[key] = {"counted": False}
            episode = open_episodes[key]
            if not episode["counted"] and item.trigger_status == "touched" and item.verdict is not None:
                samples.append(item)
                episode["counted"] = True
        previous_by_portfolio[advice.portfolio_id] = current
    return samples


def _win_rate_row(key_name: str, key: tuple[str, str], rows: list[PortfolioAdjustAdviceItem]) -> dict:
    action, value = key
    effects = [(row.return_20d if action == "add" else -row.return_20d) for row in rows]
    correct = sum(1 for row in rows if row.verdict == "correct")
    return {
        "action": action,
        key_name: value,
        "samples": len(rows),
        "correct": correct,
        "wrong": sum(1 for row in rows if row.verdict == "wrong"),
        "neutral": sum(1 for row in rows if row.verdict == "neutral"),
        "win_rate": round(correct / len(rows), 4),
        "avg_effect_20d": round(sum(effects) / len(effects), 6),
    }


def _risk_stats(advices: list[PortfolioAdjustAdvice], items_by_advice: dict) -> list[dict]:
    grouped: dict[str, list[PortfolioAdjustAdviceItem]] = defaultdict(list)
    for advice in advices:
        for item, _stock in items_by_advice.get(advice.id, []):
            if item.risk_verdict is not None:
                grouped[item.primary_risk_code or "unknown"].append(item)
    return [
        {
            "risk_code": code,
            "samples": len(rows),
            "hits": sum(1 for row in rows if row.risk_verdict == "hit"),
            "hit_rate": round(sum(1 for row in rows if row.risk_verdict == "hit") / len(rows), 4),
        }
        for code, rows in sorted(grouped.items())
    ]


# ---------------------------------------------------------------------------
# 取值工具
# ---------------------------------------------------------------------------


def _loads(text: str | None) -> dict:
    try:
        value = json.loads(text or "{}")
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _required_date(payload: dict, field: str) -> date:
    value = payload.get(field)
    if not value:
        raise ValueError(f"微操报告缺少字段: {field}")
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError as exc:
        raise ValueError(f"{field} 必须是 YYYY-MM-DD 日期") from exc


def _optional_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).strip())
    except ValueError:
        return None


def _optional_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool) or (isinstance(value, str) and not value.strip()):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _optional_int(value: Any) -> int | None:
    number = _optional_float(value)
    return int(number) if number is not None and number == int(number) else None


def _optional_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _enum_or_none(value: Any, allowed: set[str]) -> str | None:
    text = str(value or "").strip()
    return text if text in allowed else None


def _first_known(values: Any, allowed) -> str | None:
    if not isinstance(values, list) or not values:
        return None
    first = str(values[0] or "").strip()
    return first if first in allowed else None
