from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.portfolio import service
from invest_assistant.modules.portfolio.schemas import (
    PortfolioCreate,
    PortfolioPositionCreate,
    PortfolioPositionRead,
    PortfolioRead,
    PortfolioReviewCreate,
    PortfolioReviewRead,
)

router = APIRouter(prefix="/api/portfolios", tags=["portfolio"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[PortfolioRead])
def list_portfolios(db: Session = Depends(get_db)) -> list:
    return service.list_portfolios(db)


@router.post("", response_model=PortfolioRead)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db), user: UserAccount = Depends(get_current_user)):
    return service.create_portfolio(db, payload, user.id)


@router.get("/{portfolio_id}", response_model=PortfolioRead)
def get_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    item = service.get_portfolio(db, portfolio_id)
    if item is None:
        raise HTTPException(status_code=404, detail="portfolio not found")
    return item


@router.put("/{portfolio_id}", response_model=PortfolioRead)
def update_portfolio(portfolio_id: int, payload: PortfolioCreate, db: Session = Depends(get_db)):
    item = service.get_portfolio(db, portfolio_id)
    if item is None:
        raise HTTPException(status_code=404, detail="portfolio not found")
    item.name = payload.name
    item.base_currency = payload.base_currency
    db.commit()
    db.refresh(item)
    return item


@router.get("/{portfolio_id}/positions", response_model=list[PortfolioPositionRead])
def list_positions(portfolio_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_positions(db, portfolio_id)


@router.post("/{portfolio_id}/positions", response_model=PortfolioPositionRead)
def create_position(portfolio_id: int, payload: PortfolioPositionCreate, db: Session = Depends(get_db)):
    return service.create_position(db, portfolio_id, payload)


@router.put("/{portfolio_id}/positions/{position_id}", response_model=PortfolioPositionRead)
def update_position(portfolio_id: int, position_id: int, payload: PortfolioPositionCreate, db: Session = Depends(get_db)):
    position = db.get(service.PortfolioPosition, position_id)
    if position is None:
        raise HTTPException(status_code=404, detail="position not found")
    position.stock_id = payload.stock_id
    position.quantity = payload.quantity
    position.cost_price = payload.cost_price
    db.commit()
    db.refresh(position)
    return position


@router.delete("/{portfolio_id}/positions/{position_id}")
def delete_position(portfolio_id: int, position_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    position = db.get(service.PortfolioPosition, position_id)
    if position is None:
        raise HTTPException(status_code=404, detail="position not found")
    db.delete(position)
    db.commit()
    return {"success": True}


@router.get("/{portfolio_id}/review", response_model=list[PortfolioReviewRead])
def list_reviews(portfolio_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_reviews(db, portfolio_id)


@router.post("/{portfolio_id}/review", response_model=PortfolioReviewRead)
def create_review(portfolio_id: int, payload: PortfolioReviewCreate, db: Session = Depends(get_db)):
    return service.create_review(db, portfolio_id, payload)
