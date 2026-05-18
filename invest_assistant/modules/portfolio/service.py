from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.portfolio.models import Portfolio, PortfolioGroup, PortfolioPosition, PortfolioReview
from invest_assistant.modules.portfolio.schemas import PortfolioCreate, PortfolioGroupCreate, PortfolioPositionCreate, PortfolioReviewCreate


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
    data = payload.model_dump()
    if data.get("market_value") is None and data.get("current_price") is not None:
        data["market_value"] = data["quantity"] * data["current_price"]
    item = PortfolioPosition(portfolio_id=portfolio_id, **data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_positions(db: Session, portfolio_id: int) -> list[PortfolioPosition]:
    return list(db.scalars(select(PortfolioPosition).where(PortfolioPosition.portfolio_id == portfolio_id)))


def create_review(db: Session, portfolio_id: int, payload: PortfolioReviewCreate) -> PortfolioReview:
    item = PortfolioReview(portfolio_id=portfolio_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_reviews(db: Session, portfolio_id: int) -> list[PortfolioReview]:
    return list(db.scalars(select(PortfolioReview).where(PortfolioReview.portfolio_id == portfolio_id).order_by(PortfolioReview.id.desc())))
