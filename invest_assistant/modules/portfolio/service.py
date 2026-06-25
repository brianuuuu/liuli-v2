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


def refresh_position_quotes(db: Session, portfolio_id: int) -> dict:
    if db.get(Portfolio, portfolio_id) is None:
        raise ValueError("portfolio not found")
    rows = _position_rows(db, portfolio_id)
    if not rows:
        return {"updated_count": 0, "warnings": [], "dashboard": get_dashboard(db, portfolio_id)}

    symbols = [_stock_symbol(stock) for _position, stock in rows]
    quote_rows = tushare_client.fetch_realtime_quote_rows(symbols)
    quotes_by_code = {str(row["stock_code"]).strip(): row for row in quote_rows}
    updated_count = 0
    warnings: list[dict[str, str]] = []
    for position, stock in rows:
        stock_code = str(stock.stock_code or "").strip()
        quote = quotes_by_code.get(stock_code)
        if quote is None:
            warnings.append({"stock_code": stock_code, "message": "quote not found"})
            continue
        position.current_price = quote["price"]
        position.previous_close = quote["pre_close"]
        position.market_value = position.quantity * quote["price"]
        position.quote_time = quote.get("quote_time")
        position.price_source = quote.get("source")
        updated_count += 1

    if updated_count == 0 and rows:
        raise RuntimeError("no realtime quotes matched portfolio positions")
    db.commit()
    return {"updated_count": updated_count, "warnings": warnings, "dashboard": get_dashboard(db, portfolio_id)}


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
