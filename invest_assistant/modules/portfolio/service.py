from sqlalchemy import func, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.portfolio.models import Portfolio, PortfolioGroup, PortfolioPosition, PortfolioReview
from invest_assistant.modules.portfolio.schemas import PortfolioCreate, PortfolioGroupCreate, PortfolioPositionCreate, PortfolioReviewCreate
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
