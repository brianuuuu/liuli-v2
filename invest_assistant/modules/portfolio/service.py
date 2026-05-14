from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.portfolio.models import Portfolio, PortfolioPosition, PortfolioReview
from invest_assistant.modules.portfolio.schemas import PortfolioCreate, PortfolioPositionCreate, PortfolioReviewCreate


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


def create_position(db: Session, portfolio_id: int, payload: PortfolioPositionCreate) -> PortfolioPosition:
    item = PortfolioPosition(portfolio_id=portfolio_id, **payload.model_dump())
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
