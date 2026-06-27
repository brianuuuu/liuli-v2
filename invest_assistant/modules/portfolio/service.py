from datetime import date
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.portfolio.models import (
    Portfolio,
    PortfolioCashBalance,
    PortfolioCashFlow,
    PortfolioGroup,
    PortfolioPosition,
    PortfolioReview,
    PortfolioValueSnapshot,
)
from invest_assistant.modules.stock_analysis import service as stock_analysis_service
from invest_assistant.modules.portfolio.schemas import (
    PortfolioCashFlowCreate,
    PortfolioCashUpdate,
    PortfolioCreate,
    PortfolioGroupCreate,
    PortfolioPositionCreate,
    PortfolioReviewCreate,
)
from invest_assistant.shared.time_utils import utc_now
from invest_assistant.services.tushare import client as tushare_client


def create_portfolio(db: Session, payload: PortfolioCreate, user_id: int | None) -> Portfolio:
    item = Portfolio(**payload.model_dump(), user_id=user_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_portfolios(db: Session) -> list[Portfolio]:
    return list(db.scalars(select(Portfolio).order_by(Portfolio.id.desc())))


def get_portfolio(db: Session, portfolio_id: int) -> Portfolio | None:
    return db.get(Portfolio, portfolio_id)


def update_portfolio(db: Session, portfolio_id: int, payload: PortfolioCreate) -> Portfolio | None:
    item = db.get(Portfolio, portfolio_id)
    if item is None:
        return None
    item.name = payload.name
    item.base_currency = payload.base_currency
    db.commit()
    db.refresh(item)
    return item


def delete_portfolio(db: Session, portfolio_id: int) -> bool:
    item = db.get(Portfolio, portfolio_id)
    if item is None:
        return False
    related_count = _portfolio_related_count(db, portfolio_id)
    if related_count:
        raise ValueError("non-empty portfolio cannot be deleted")
    db.delete(item)
    db.commit()
    return True


def _portfolio_related_count(db: Session, portfolio_id: int) -> int:
    counts = [
        db.scalar(select(func.count(PortfolioGroup.id)).where(PortfolioGroup.portfolio_id == portfolio_id)) or 0,
        db.scalar(select(func.count(PortfolioPosition.id)).where(PortfolioPosition.portfolio_id == portfolio_id)) or 0,
        db.scalar(select(func.count(PortfolioReview.id)).where(PortfolioReview.portfolio_id == portfolio_id)) or 0,
        db.scalar(select(func.count(PortfolioCashBalance.id)).where(PortfolioCashBalance.portfolio_id == portfolio_id)) or 0,
        db.scalar(select(func.count(PortfolioCashFlow.id)).where(PortfolioCashFlow.portfolio_id == portfolio_id)) or 0,
        db.scalar(select(func.count(PortfolioValueSnapshot.id)).where(PortfolioValueSnapshot.portfolio_id == portfolio_id)) or 0,
    ]
    return int(sum(counts))


def create_group(db: Session, portfolio_id: int, payload: PortfolioGroupCreate) -> PortfolioGroup:
    item = PortfolioGroup(portfolio_id=portfolio_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_groups(db: Session, portfolio_id: int) -> list[PortfolioGroup]:
    return list(db.scalars(select(PortfolioGroup).where(PortfolioGroup.portfolio_id == portfolio_id).order_by(PortfolioGroup.sort_order.asc(), PortfolioGroup.id.asc())))


def update_group(db: Session, group_id: int, payload: PortfolioGroupCreate) -> PortfolioGroup | None:
    item = db.get(PortfolioGroup, group_id)
    if item is None:
        return None
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def create_position(db: Session, portfolio_id: int, payload: PortfolioPositionCreate) -> PortfolioPosition:
    return create_or_update_position(db, portfolio_id, payload)


def create_or_update_position(db: Session, portfolio_id: int, payload: PortfolioPositionCreate) -> PortfolioPosition:
    if db.get(Portfolio, portfolio_id) is None:
        raise ValueError("portfolio not found")
    if db.get(Stock, payload.stock_id) is None:
        raise ValueError("stock not found")
    data = payload.model_dump()
    if data.get("market_value") is None and data.get("current_price") is not None:
        data["market_value"] = data["quantity"] * data["current_price"]
    item = db.scalar(
        select(PortfolioPosition).where(
            PortfolioPosition.portfolio_id == portfolio_id,
            PortfolioPosition.stock_id == payload.stock_id,
        )
    )
    if item is None:
        item = PortfolioPosition(portfolio_id=portfolio_id, **data)
        db.add(item)
    else:
        for key, value in data.items():
            setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def list_positions(db: Session, portfolio_id: int) -> list[PortfolioPosition]:
    return list(db.scalars(select(PortfolioPosition).where(PortfolioPosition.portfolio_id == portfolio_id).order_by(PortfolioPosition.id.asc())))


def update_position(db: Session, portfolio_id: int, position_id: int, payload: PortfolioPositionCreate) -> PortfolioPosition | None:
    item = db.get(PortfolioPosition, position_id)
    if item is None or item.portfolio_id != portfolio_id:
        return None
    if db.get(Stock, payload.stock_id) is None:
        raise ValueError("stock not found")
    data = payload.model_dump()
    if data.get("market_value") is None and data.get("current_price") is not None:
        data["market_value"] = data["quantity"] * data["current_price"]
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_position(db: Session, portfolio_id: int, position_id: int) -> bool:
    item = db.get(PortfolioPosition, position_id)
    if item is None or item.portfolio_id != portfolio_id:
        return False
    db.delete(item)
    db.commit()
    return True


def get_dashboard(db: Session, portfolio_id: int) -> dict | None:
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None:
        return None
    rows = _position_rows(db, portfolio_id)
    positions = [_position_dict(position, stock) for position, stock in rows]
    return {
        "portfolio": _portfolio_dict(portfolio),
        "summary": _summary(positions),
        "positions": positions,
        "warnings": [],
    }


def get_cash_balance(db: Session, portfolio_id: int) -> dict:
    portfolio = db.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise ValueError("portfolio not found")
    item = db.scalar(select(PortfolioCashBalance).where(PortfolioCashBalance.portfolio_id == portfolio_id))
    if item is None:
        return {
            "id": None,
            "portfolio_id": portfolio_id,
            "amount": 0.0,
            "currency": portfolio.base_currency or "CNY",
            "note": None,
            "created_at": None,
            "updated_at": None,
        }
    return _cash_balance_dict(item)


def update_cash_balance(db: Session, portfolio_id: int, payload: PortfolioCashUpdate) -> dict:
    if db.get(Portfolio, portfolio_id) is None:
        raise ValueError("portfolio not found")
    item = db.scalar(select(PortfolioCashBalance).where(PortfolioCashBalance.portfolio_id == portfolio_id))
    if item is None:
        item = PortfolioCashBalance(portfolio_id=portfolio_id)
        db.add(item)
    item.amount = float(payload.amount or 0)
    item.currency = payload.currency or "CNY"
    item.note = payload.note
    db.commit()
    db.refresh(item)
    upsert_value_snapshot(db, portfolio_id, source="manual")
    return _cash_balance_dict(item)


def create_cash_flow(db: Session, portfolio_id: int, payload: PortfolioCashFlowCreate) -> PortfolioCashFlow:
    if db.get(Portfolio, portfolio_id) is None:
        raise ValueError("portfolio not found")
    flow_type = str(payload.flow_type or "").strip()
    if flow_type not in {"deposit", "withdraw", "adjustment", "dividend", "interest"}:
        raise ValueError("unsupported cash flow type")
    amount = float(payload.amount or 0)
    flow_date = payload.flow_date or _today_shanghai()
    item = PortfolioCashFlow(
        portfolio_id=portfolio_id,
        flow_type=flow_type,
        amount=amount,
        currency=payload.currency or "CNY",
        flow_date=flow_date,
        note=payload.note,
    )
    db.add(item)
    balance = _cash_balance_model(db, portfolio_id, payload.currency or "CNY")
    if flow_type == "withdraw":
        balance.amount = float(balance.amount or 0) - amount
    elif flow_type == "adjustment":
        balance.amount = amount
    else:
        balance.amount = float(balance.amount or 0) + amount
    balance.currency = payload.currency or balance.currency or "CNY"
    db.commit()
    db.refresh(item)
    upsert_value_snapshot(db, portfolio_id, source="manual")
    return item


def list_cash_flows(db: Session, portfolio_id: int) -> list[PortfolioCashFlow]:
    return list(
        db.scalars(
            select(PortfolioCashFlow)
            .where(PortfolioCashFlow.portfolio_id == portfolio_id)
            .order_by(PortfolioCashFlow.flow_date.desc(), PortfolioCashFlow.id.desc())
        )
    )


def get_overview(db: Session, portfolio_id: int | None = None) -> dict:
    portfolios = [db.get(Portfolio, portfolio_id)] if portfolio_id else list_portfolios(db)
    portfolios = [portfolio for portfolio in portfolios if portfolio is not None]
    selected_id = portfolio_id if portfolio_id is not None else None
    portfolio_options = [_portfolio_dict(item) for item in list_portfolios(db)]
    allocation: dict[int, dict] = {}
    total_position_value = 0.0
    total_previous_value = 0.0
    total_day_pnl = 0.0
    total_position_count = 0
    total_cash = 0.0
    for portfolio in portfolios:
        rows = _position_rows(db, portfolio.id)
        positions = [_position_dict(position, stock) for position, stock in rows]
        for position in positions:
            value = float(position["market_value"] or 0)
            stock_id = int(position["stock_id"])
            item = allocation.setdefault(
                stock_id,
                {
                    "type": "stock",
                    "stock_id": stock_id,
                    "stock_code": position.get("stock_code"),
                    "label": position.get("stock_name") or position.get("stock_code") or position.get("symbol") or str(stock_id),
                    "market_value": 0.0,
                },
            )
            item["market_value"] += value
        summary = _summary(positions)
        total_position_value += float(summary["market_value"] or 0)
        total_previous_value += float(summary["previous_market_value"] or 0)
        total_day_pnl += float(summary["day_pnl"] or 0)
        total_position_count += int(summary["position_count"] or 0)
        total_cash += float(get_cash_balance(db, portfolio.id)["amount"] or 0)
    total_value = total_position_value + total_cash
    previous_total = total_previous_value + total_cash
    allocation_rows = _allocation_rows(allocation, total_position_value)
    return {
        "scope": "single" if portfolio_id else "all",
        "portfolio_id": selected_id,
        "portfolio_options": portfolio_options,
        "summary": {
            "portfolio_count": len(portfolios),
            "position_count": total_position_count,
            "position_market_value": total_position_value,
            "cash_amount": total_cash,
            "total_value": total_value,
            "day_pnl": total_day_pnl,
            "day_pct": total_day_pnl / previous_total * 100 if previous_total else None,
            "year_pnl": _year_pnl(db, [item.id for item in portfolios], total_value),
        },
        "allocation_rows": allocation_rows,
        "pie_items": [row for row in allocation_rows if row["type"] != "total" and row["market_value"] > 0],
    }


def upsert_value_snapshot(
    db: Session,
    portfolio_id: int,
    snapshot_date: date | None = None,
    source: str = "scheduled",
) -> PortfolioValueSnapshot:
    snapshot_date = snapshot_date or _today_shanghai()
    dashboard = get_dashboard(db, portfolio_id)
    if dashboard is None:
        raise ValueError("portfolio not found")
    summary = dashboard["summary"]
    cash_amount = float(get_cash_balance(db, portfolio_id)["amount"] or 0)
    position_market_value = float(summary["market_value"] or 0)
    item = db.scalar(
        select(PortfolioValueSnapshot).where(
            PortfolioValueSnapshot.portfolio_id == portfolio_id,
            PortfolioValueSnapshot.snapshot_date == snapshot_date,
        )
    )
    if item is None:
        item = PortfolioValueSnapshot(portfolio_id=portfolio_id, snapshot_date=snapshot_date)
        db.add(item)
    item.position_market_value = position_market_value
    item.cash_amount = cash_amount
    item.total_value = position_market_value + cash_amount
    item.day_pnl = summary["day_pnl"]
    item.day_pct = summary["day_pct"]
    item.position_count = summary["position_count"]
    item.source = source
    item.updated_at = utc_now()
    db.commit()
    db.refresh(item)
    return item


def capture_daily_value_snapshots(
    db: Session,
    snapshot_date: date | None = None,
    source: str = "scheduled",
    refresh_quotes: bool = True,
) -> dict:
    snapshot_date = snapshot_date or _today_shanghai()
    processed_count = 0
    updated_count = 0
    warnings: list[dict] = []
    for portfolio in list_portfolios(db):
        if refresh_quotes and _portfolio_has_positions(db, portfolio.id):
            try:
                refresh_result = refresh_position_quotes(db, portfolio.id)
                warnings.extend(refresh_result.get("warnings") or [])
            except RuntimeError as exc:
                warnings.append({"portfolio_id": portfolio.id, "message": str(exc)})
        before = db.scalar(
            select(PortfolioValueSnapshot).where(
                PortfolioValueSnapshot.portfolio_id == portfolio.id,
                PortfolioValueSnapshot.snapshot_date == snapshot_date,
            )
        )
        upsert_value_snapshot(db, portfolio.id, snapshot_date=snapshot_date, source=source)
        processed_count += 1
        updated_count += 1 if before is not None else 0
    return {
        "processed_count": processed_count,
        "updated_count": updated_count,
        "warnings": warnings,
        "snapshot_date": snapshot_date.isoformat(),
    }


def list_value_snapshots(db: Session, portfolio_id: int | None = None, days: int = 180) -> list[dict]:
    limit = max(int(days or 180), 1)
    stmt = select(PortfolioValueSnapshot).order_by(PortfolioValueSnapshot.snapshot_date.desc(), PortfolioValueSnapshot.id.desc())
    if portfolio_id:
        stmt = stmt.where(PortfolioValueSnapshot.portfolio_id == portfolio_id)
    rows = list(db.scalars(stmt.limit(limit * max(1, len(list_portfolios(db)) or 1))))
    if portfolio_id:
        return [_snapshot_dict(item) for item in reversed(rows[:limit])]
    by_date: dict[date, dict] = {}
    for item in rows:
        bucket = by_date.setdefault(
            item.snapshot_date,
            {
                "portfolio_id": None,
                "snapshot_date": item.snapshot_date,
                "total_value": 0.0,
                "position_market_value": 0.0,
                "cash_amount": 0.0,
                "day_pnl": 0.0,
                "day_pct": None,
                "position_count": 0,
                "source": "aggregate",
            },
        )
        bucket["total_value"] += float(item.total_value or 0)
        bucket["position_market_value"] += float(item.position_market_value or 0)
        bucket["cash_amount"] += float(item.cash_amount or 0)
        bucket["day_pnl"] += float(item.day_pnl or 0)
        bucket["position_count"] += int(item.position_count or 0)
    return list(reversed([by_date[key] for key in sorted(by_date.keys(), reverse=True)[:limit]]))


def get_review_performance(
    db: Session,
    portfolio_id: int | None = None,
    period: str = "year",
    benchmark_code: str = "000300.SH",
    refresh_benchmark: bool = True,
) -> dict:
    normalized_period = period if period in {"month", "year", "all"} else "year"
    today = _today_shanghai()
    portfolio_ids = [portfolio_id] if portfolio_id else [item.id for item in list_portfolios(db)]
    portfolio_ids = [item for item in portfolio_ids if db.get(Portfolio, item) is not None]
    range_start = _review_range_start(db, portfolio_ids, normalized_period, today)
    if range_start is None:
        return _empty_review_performance(db, portfolio_id, normalized_period, benchmark_code, today)

    snapshots = _review_snapshot_points(db, portfolio_ids, range_start, today)
    if not snapshots:
        return _empty_review_performance(db, portfolio_id, normalized_period, benchmark_code, today)

    benchmark_rows = stock_analysis_service.list_market_index_daily_bars(
        db,
        benchmark_code,
        start_date=snapshots[0]["date"],
        end_date=today,
        refresh=refresh_benchmark,
    )
    benchmark_by_date = {item.trade_date: item for item in benchmark_rows}
    curve_points = _review_curve_points(db, portfolio_ids, snapshots, benchmark_by_date)
    calendar = _review_calendar(curve_points, normalized_period)
    last_point = curve_points[-1] if curve_points else {}
    return {
        "scope": "single" if portfolio_id else "all",
        "portfolio_id": portfolio_id,
        "period": normalized_period,
        "start_date": snapshots[0]["date"].isoformat(),
        "end_date": snapshots[-1]["date"].isoformat(),
        "portfolio_options": [_portfolio_dict(item) for item in list_portfolios(db)],
        "benchmark": {
            "code": benchmark_code,
            "name": stock_analysis_service._market_index_name(benchmark_code),
        },
        "summary": {
            "portfolio_return_pct": last_point.get("portfolio_return_pct"),
            "benchmark_return_pct": last_point.get("benchmark_return_pct"),
            "excess_return_pct": last_point.get("excess_return_pct"),
            "max_drawdown_pct": _max_drawdown_pct(curve_points),
            "effective_days": len(curve_points),
        },
        "curve_points": curve_points,
        "calendar": calendar,
    }


def _empty_review_performance(db: Session, portfolio_id: int | None, period: str, benchmark_code: str, today: date) -> dict:
    return {
        "scope": "single" if portfolio_id else "all",
        "portfolio_id": portfolio_id,
        "period": period,
        "start_date": today.isoformat(),
        "end_date": today.isoformat(),
        "portfolio_options": [_portfolio_dict(item) for item in list_portfolios(db)],
        "benchmark": {"code": benchmark_code, "name": stock_analysis_service._market_index_name(benchmark_code)},
        "summary": {
            "portfolio_return_pct": None,
            "benchmark_return_pct": None,
            "excess_return_pct": None,
            "max_drawdown_pct": None,
            "effective_days": 0,
        },
        "curve_points": [],
        "calendar": {"granularity": _calendar_granularity(period), "items": []},
    }


def _review_range_start(db: Session, portfolio_ids: list[int], period: str, today: date) -> date | None:
    if period == "month":
        return date(today.year, today.month, 1)
    if period == "year":
        return date(today.year, 1, 1)
    if not portfolio_ids:
        return None
    first_snapshot = db.scalar(
        select(func.min(PortfolioValueSnapshot.snapshot_date)).where(PortfolioValueSnapshot.portfolio_id.in_(portfolio_ids))
    )
    return first_snapshot


def _review_snapshot_points(db: Session, portfolio_ids: list[int], start_date: date, end_date: date) -> list[dict]:
    if not portfolio_ids:
        return []
    rows = list(
        db.scalars(
            select(PortfolioValueSnapshot)
            .where(
                PortfolioValueSnapshot.portfolio_id.in_(portfolio_ids),
                PortfolioValueSnapshot.snapshot_date >= start_date,
                PortfolioValueSnapshot.snapshot_date <= end_date,
            )
            .order_by(PortfolioValueSnapshot.snapshot_date.asc(), PortfolioValueSnapshot.portfolio_id.asc(), PortfolioValueSnapshot.id.asc())
        )
    )
    by_date: dict[date, dict] = {}
    for item in rows:
        bucket = by_date.setdefault(
            item.snapshot_date,
            {
                "date": item.snapshot_date,
                "total_value": 0.0,
                "position_market_value": 0.0,
                "cash_amount": 0.0,
                "position_count": 0,
            },
        )
        bucket["total_value"] += float(item.total_value or 0)
        bucket["position_market_value"] += float(item.position_market_value or 0)
        bucket["cash_amount"] += float(item.cash_amount or 0)
        bucket["position_count"] += int(item.position_count or 0)
    return [by_date[key] for key in sorted(by_date)]


def _review_curve_points(db: Session, portfolio_ids: list[int], snapshots: list[dict], benchmark_by_date: dict[date, object]) -> list[dict]:
    base_value = float(snapshots[0]["total_value"] or 0)
    if base_value <= 0:
        return []
    base_date = snapshots[0]["date"]
    flow_by_date = _review_external_flows_by_date(db, portfolio_ids, base_date, snapshots[-1]["date"])
    benchmark_base = _benchmark_close_for_date(benchmark_by_date, base_date)
    cumulative_external_flow = 0.0
    previous_value = base_value
    points: list[dict] = []
    for index, item in enumerate(snapshots):
        item_date = item["date"]
        day_external_flow = flow_by_date.get(item_date, 0.0) if item_date > base_date else 0.0
        cumulative_external_flow += day_external_flow
        total_value = float(item["total_value"] or 0)
        portfolio_return = (total_value - base_value - cumulative_external_flow) / base_value * 100
        daily_return = 0.0 if index == 0 or previous_value <= 0 else (total_value - previous_value - day_external_flow) / previous_value * 100
        benchmark_close = _benchmark_close_for_date(benchmark_by_date, item_date)
        benchmark_return = (
            (benchmark_close - benchmark_base) / benchmark_base * 100
            if benchmark_close is not None and benchmark_base
            else None
        )
        excess_return = portfolio_return - benchmark_return if benchmark_return is not None else None
        points.append(
            {
                "date": item_date.isoformat(),
                "total_value": total_value,
                "portfolio_return_pct": portfolio_return,
                "benchmark_return_pct": benchmark_return,
                "excess_return_pct": excess_return,
                "daily_return_pct": daily_return,
                "external_flow": day_external_flow,
                "benchmark_close": benchmark_close,
            }
        )
        previous_value = total_value
    return points


def _review_external_flows_by_date(db: Session, portfolio_ids: list[int], start_date: date, end_date: date) -> dict[date, float]:
    rows = list(
        db.scalars(
            select(PortfolioCashFlow)
            .where(
                PortfolioCashFlow.portfolio_id.in_(portfolio_ids),
                PortfolioCashFlow.flow_date > start_date,
                PortfolioCashFlow.flow_date <= end_date,
            )
            .order_by(PortfolioCashFlow.flow_date.asc(), PortfolioCashFlow.id.asc())
        )
    )
    result: dict[date, float] = {}
    for item in rows:
        amount = _external_flow_amount(item)
        result[item.flow_date] = result.get(item.flow_date, 0.0) + amount
    return result


def _external_flow_amount(item: PortfolioCashFlow) -> float:
    amount = float(item.amount or 0)
    if item.flow_type == "withdraw":
        return -amount
    if item.flow_type in {"deposit", "adjustment"}:
        return amount
    return 0.0


def _benchmark_close_for_date(benchmark_by_date: dict[date, object], target_date: date) -> float | None:
    row = benchmark_by_date.get(target_date)
    return float(row.close) if row is not None and getattr(row, "close", None) is not None else None


def _review_calendar(curve_points: list[dict], period: str) -> dict:
    granularity = _calendar_granularity(period)
    if granularity == "day":
        return {
            "granularity": granularity,
            "items": [
                {
                    "key": point["date"],
                    "label": point["date"][5:],
                    "return_pct": point["daily_return_pct"],
                    "value": point["daily_return_pct"],
                }
                for point in curve_points
            ],
        }

    buckets: dict[str, dict] = {}
    order: list[str] = []
    previous_point: dict | None = None
    for point in curve_points:
        key = point["date"][:7] if granularity == "month" else point["date"][:4]
        if key not in buckets:
            buckets[key] = {"start": previous_point, "end": point}
            order.append(key)
        buckets[key]["end"] = point
        previous_point = point
    items = []
    for key in order:
        bucket = buckets[key]
        start = bucket["start"]
        end = bucket["end"]
        return_pct = 0.0 if start is None else float(end["portfolio_return_pct"] or 0) - float(start["portfolio_return_pct"] or 0)
        items.append({"key": key, "label": key, "return_pct": return_pct, "value": return_pct})
    return {"granularity": granularity, "items": items}


def _calendar_granularity(period: str) -> str:
    if period == "month":
        return "day"
    if period == "year":
        return "month"
    return "year"


def _max_drawdown_pct(curve_points: list[dict]) -> float | None:
    if not curve_points:
        return None
    peak = 0.0
    max_drawdown = 0.0
    for point in curve_points:
        value = float(point["portfolio_return_pct"] or 0)
        peak = max(peak, value)
        max_drawdown = min(max_drawdown, value - peak)
    return max_drawdown


def refresh_position_quotes(db: Session, portfolio_id: int) -> dict:
    if db.get(Portfolio, portfolio_id) is None:
        raise ValueError("portfolio not found")
    rows = _position_rows(db, portfolio_id)
    if not rows:
        return {"updated_count": 0, "warnings": [], "dashboard": get_dashboard(db, portfolio_id)}

    result = _refresh_position_rows(rows)
    if result["updated_count"] == 0 and rows:
        raise RuntimeError("no realtime quotes matched portfolio positions")
    db.commit()
    warnings = [
        {"stock_code": item["stock_code"], "message": item["message"]}
        for item in result["warnings"]
    ]
    return {"updated_count": result["updated_count"], "warnings": warnings, "dashboard": get_dashboard(db, portfolio_id)}


def refresh_portfolio_realtime_quotes(db: Session, portfolio_ids: list[int] | None = None) -> dict:
    portfolios = [db.get(Portfolio, portfolio_id) for portfolio_id in portfolio_ids] if portfolio_ids else list_portfolios(db)
    portfolios = [portfolio for portfolio in portfolios if portfolio is not None]
    rows_by_portfolio = {portfolio.id: _position_rows(db, portfolio.id) for portfolio in portfolios}
    rows: list[tuple[PortfolioPosition, Stock]] = []
    for portfolio_rows in rows_by_portfolio.values():
        rows.extend(portfolio_rows)

    if not rows:
        return {
            "processed_count": len(portfolios),
            "updated_count": 0,
            "position_count": 0,
            "warnings": [],
        }

    try:
        result = _refresh_position_rows(rows)
    except RuntimeError as exc:
        warnings = [{"portfolio_id": portfolio.id, "message": str(exc)} for portfolio in portfolios]
        return {
            "processed_count": len(portfolios),
            "updated_count": 0,
            "position_count": len(rows),
            "warnings": warnings,
        }
    db.commit()
    return {
        "processed_count": len(portfolios),
        "updated_count": result["updated_count"],
        "position_count": len(rows),
        "warnings": result["warnings"],
    }


def _refresh_position_rows(rows: list[tuple[PortfolioPosition, Stock]]) -> dict:
    symbols = sorted({_stock_symbol(stock) for _position, stock in rows})
    quote_rows = tushare_client.fetch_realtime_quote_rows(symbols)
    quotes_by_code = {str(row["stock_code"]).strip(): row for row in quote_rows}
    updated_count = 0
    warnings: list[dict[str, str | int]] = []
    for position, stock in rows:
        stock_code = str(stock.stock_code or "").strip()
        quote = quotes_by_code.get(stock_code)
        if quote is None:
            warnings.append({"portfolio_id": position.portfolio_id, "stock_code": stock_code, "message": "quote not found"})
            continue
        position.current_price = quote["price"]
        position.previous_close = quote["pre_close"]
        position.market_value = position.quantity * quote["price"]
        position.quote_time = quote.get("quote_time")
        position.price_source = quote.get("source")
        updated_count += 1
    return {"updated_count": updated_count, "warnings": warnings}


def _position_rows(db: Session, portfolio_id: int) -> list[tuple[PortfolioPosition, Stock]]:
    return list(
        db.execute(
            select(PortfolioPosition, Stock)
            .join(Stock, Stock.id == PortfolioPosition.stock_id)
            .where(PortfolioPosition.portfolio_id == portfolio_id)
            .order_by(PortfolioPosition.id.asc())
        ).all()
    )


def _portfolio_dict(item: Portfolio) -> dict:
    return {
        "id": item.id,
        "user_id": item.user_id,
        "name": item.name,
        "base_currency": item.base_currency,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _position_dict(item: PortfolioPosition, stock: Stock) -> dict:
    current_price = item.current_price
    previous_close = item.previous_close
    market_value = item.quantity * current_price if current_price is not None else None
    previous_market_value = item.quantity * previous_close if previous_close is not None else None
    day_pnl = item.quantity * (current_price - previous_close) if current_price is not None and previous_close is not None else None
    day_pct = (day_pnl / previous_market_value * 100) if day_pnl is not None and previous_market_value else None
    return {
        "id": item.id,
        "portfolio_id": item.portfolio_id,
        "group_id": item.group_id,
        "stock_id": item.stock_id,
        "stock_code": stock.stock_code,
        "stock_name": stock.stock_name,
        "symbol": stock.symbol,
        "quantity": item.quantity,
        "cost_price": item.cost_price,
        "current_price": current_price,
        "previous_close": previous_close,
        "market_value": market_value,
        "previous_market_value": previous_market_value,
        "day_pnl": day_pnl,
        "day_pct": day_pct,
        "quote_time": item.quote_time,
        "price_source": item.price_source,
        "target_weight": item.target_weight,
        "note": item.note,
        "status": item.status,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _summary(positions: list[dict]) -> dict:
    market_value = sum(float(item["market_value"] or 0) for item in positions)
    previous_market_value = sum(float(item["previous_market_value"] or 0) for item in positions)
    day_pnl = sum(float(item["day_pnl"] or 0) for item in positions)
    quote_times = [item["quote_time"] for item in positions if item.get("quote_time") is not None]
    return {
        "position_count": len(positions),
        "market_value": market_value,
        "previous_market_value": previous_market_value,
        "day_pnl": day_pnl,
        "day_pct": day_pnl / previous_market_value * 100 if previous_market_value else None,
        "latest_quote_time": max(quote_times) if quote_times else None,
    }


def _stock_symbol(stock: Stock) -> str:
    symbol = str(stock.symbol or "").strip().upper()
    if symbol:
        return symbol
    stock_code = str(stock.stock_code or "").strip()
    exchange = str(stock.exchange or "").strip().upper()
    if exchange in {"SSE", "SH", "SHSE", "XSHG"}:
        return f"{stock_code}.SH"
    if exchange in {"BJ", "BSE", "BJS", "XBSE"}:
        return f"{stock_code}.BJ"
    return f"{stock_code}.SZ"


def create_review(db: Session, portfolio_id: int, payload: PortfolioReviewCreate) -> PortfolioReview:
    item = PortfolioReview(portfolio_id=portfolio_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_reviews(db: Session, portfolio_id: int) -> list[PortfolioReview]:
    return list(db.scalars(select(PortfolioReview).where(PortfolioReview.portfolio_id == portfolio_id).order_by(PortfolioReview.id.desc())))


def _cash_balance_model(db: Session, portfolio_id: int, currency: str = "CNY") -> PortfolioCashBalance:
    item = db.scalar(select(PortfolioCashBalance).where(PortfolioCashBalance.portfolio_id == portfolio_id))
    if item is None:
        item = PortfolioCashBalance(portfolio_id=portfolio_id, amount=0, currency=currency or "CNY")
        db.add(item)
        db.flush()
    return item


def _cash_balance_dict(item: PortfolioCashBalance) -> dict:
    return {
        "id": item.id,
        "portfolio_id": item.portfolio_id,
        "amount": item.amount,
        "currency": item.currency,
        "note": item.note,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _allocation_rows(allocation: dict[int, dict], total_value: float) -> list[dict]:
    rows = [
        {
            "type": "total",
            "label": "总和",
            "market_value": total_value,
            "weight": 100.0 if total_value else 0.0,
        }
    ]
    for item in sorted(allocation.values(), key=lambda row: float(row["market_value"] or 0), reverse=True):
        value = float(item["market_value"] or 0)
        rows.append(
            {
                "type": "stock",
                "stock_id": item["stock_id"],
                "stock_code": item.get("stock_code"),
                "label": item["label"],
                "market_value": value,
                "weight": value / total_value * 100 if total_value else 0.0,
            }
        )
    return rows


def _portfolio_has_positions(db: Session, portfolio_id: int) -> bool:
    return bool(db.scalar(select(func.count(PortfolioPosition.id)).where(PortfolioPosition.portfolio_id == portfolio_id)) or 0)


def _today_shanghai() -> date:
    return utc_now().astimezone(ZoneInfo("Asia/Shanghai")).date()


def _year_pnl(db: Session, portfolio_ids: list[int], current_total_value: float) -> float:
    if not portfolio_ids:
        return 0.0
    year_start = date(_today_shanghai().year, 1, 1)
    deposits = _cash_flow_sum(db, portfolio_ids, {"deposit"}, year_start)
    withdrawals = _cash_flow_sum(db, portfolio_ids, {"withdraw"}, year_start)
    start_value = _start_value_for_year(db, portfolio_ids, year_start)
    return current_total_value - start_value - deposits + withdrawals


def _cash_flow_sum(db: Session, portfolio_ids: list[int], flow_types: set[str], start_date: date) -> float:
    return float(
        db.scalar(
            select(func.coalesce(func.sum(PortfolioCashFlow.amount), 0)).where(
                PortfolioCashFlow.portfolio_id.in_(portfolio_ids),
                PortfolioCashFlow.flow_type.in_(flow_types),
                PortfolioCashFlow.flow_date >= start_date,
            )
        )
        or 0
    )


def _start_value_for_year(db: Session, portfolio_ids: list[int], year_start: date) -> float:
    total = 0.0
    for portfolio_id in portfolio_ids:
        snapshot = db.scalar(
            select(PortfolioValueSnapshot)
            .where(
                PortfolioValueSnapshot.portfolio_id == portfolio_id,
                PortfolioValueSnapshot.snapshot_date <= year_start,
            )
            .order_by(PortfolioValueSnapshot.snapshot_date.desc(), PortfolioValueSnapshot.id.desc())
        )
        total += float(snapshot.total_value or 0) if snapshot is not None else 0.0
    return total


def _snapshot_dict(item: PortfolioValueSnapshot) -> dict:
    return {
        "portfolio_id": item.portfolio_id,
        "snapshot_date": item.snapshot_date,
        "total_value": item.total_value,
        "position_market_value": item.position_market_value,
        "cash_amount": item.cash_amount,
        "day_pnl": item.day_pnl,
        "day_pct": item.day_pct,
        "position_count": item.position_count,
        "source": item.source,
    }
