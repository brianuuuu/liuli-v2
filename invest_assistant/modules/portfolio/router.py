from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.portfolio import service
from invest_assistant.modules.portfolio.schemas import (
    PortfolioCashFlowCreate,
    PortfolioCashFlowRead,
    PortfolioCashRead,
    PortfolioCashUpdate,
    PortfolioCreate,
    PortfolioGroupCreate,
    PortfolioGroupRead,
    PortfolioPositionCreate,
    PortfolioPositionRead,
    PortfolioRead,
    PortfolioReviewCreate,
    PortfolioReviewRead,
    PortfolioValueSnapshotRead,
)

router = APIRouter(prefix="/api/portfolios", tags=["portfolio"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[PortfolioRead])
def list_portfolios(db: Session = Depends(get_db)) -> list:
    return service.list_portfolios(db)


@router.post("", response_model=PortfolioRead)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db), user: UserAccount = Depends(get_current_user)):
    return service.create_portfolio(db, payload, user.id)


@router.get("/overview")
def get_overview(portfolio_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    return service.get_overview(db, portfolio_id)


@router.get("/value-snapshots", response_model=list[PortfolioValueSnapshotRead])
def list_value_snapshots(portfolio_id: int | None = None, days: int = 180, db: Session = Depends(get_db)) -> list:
    return service.list_value_snapshots(db, portfolio_id, days)


@router.get("/review-performance")
def get_review_performance(
    portfolio_id: int | None = None,
    period: str = "year",
    benchmark_code: str = "000300.SH",
    refresh_benchmark: bool = True,
    db: Session = Depends(get_db),
) -> dict:
    try:
        return service.get_review_performance(
            db,
            portfolio_id=portfolio_id,
            period=period,
            benchmark_code=benchmark_code,
            refresh_benchmark=refresh_benchmark,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{portfolio_id}", response_model=PortfolioRead)
def get_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    item = service.get_portfolio(db, portfolio_id)
    if item is None:
        raise HTTPException(status_code=404, detail="portfolio not found")
    return item


@router.put("/{portfolio_id}", response_model=PortfolioRead)
def update_portfolio(portfolio_id: int, payload: PortfolioCreate, db: Session = Depends(get_db)):
    item = service.update_portfolio(db, portfolio_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="portfolio not found")
    return item


@router.delete("/{portfolio_id}")
def delete_portfolio(portfolio_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    try:
        deleted = service.delete_portfolio(db, portfolio_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="portfolio not found")
    return {"success": True}


@router.get("/{portfolio_id}/dashboard")
def get_dashboard(portfolio_id: int, db: Session = Depends(get_db)) -> dict:
    dashboard = service.get_dashboard(db, portfolio_id)
    if dashboard is None:
        raise HTTPException(status_code=404, detail="portfolio not found")
    return dashboard


@router.get("/{portfolio_id}/groups", response_model=list[PortfolioGroupRead])
def list_groups(portfolio_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_groups(db, portfolio_id)


@router.post("/{portfolio_id}/groups", response_model=PortfolioGroupRead)
def create_group(portfolio_id: int, payload: PortfolioGroupCreate, db: Session = Depends(get_db)):
    if service.get_portfolio(db, portfolio_id) is None:
        raise HTTPException(status_code=404, detail="portfolio not found")
    return service.create_group(db, portfolio_id, payload)


@router.put("/{portfolio_id}/groups/{group_id}", response_model=PortfolioGroupRead)
def update_group(portfolio_id: int, group_id: int, payload: PortfolioGroupCreate, db: Session = Depends(get_db)):
    group = service.update_group(db, group_id, payload)
    if group is None:
        raise HTTPException(status_code=404, detail="group not found")
    return group


@router.get("/{portfolio_id}/positions", response_model=list[PortfolioPositionRead])
def list_positions(portfolio_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_positions(db, portfolio_id)


@router.post("/{portfolio_id}/positions", response_model=PortfolioPositionRead)
def create_position(portfolio_id: int, payload: PortfolioPositionCreate, db: Session = Depends(get_db)):
    try:
        return service.create_or_update_position(db, portfolio_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{portfolio_id}/positions/{position_id}", response_model=PortfolioPositionRead)
def update_position(portfolio_id: int, position_id: int, payload: PortfolioPositionCreate, db: Session = Depends(get_db)):
    try:
        position = service.update_position(db, portfolio_id, position_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if position is None:
        raise HTTPException(status_code=404, detail="position not found")
    return position


@router.delete("/{portfolio_id}/positions/{position_id}")
def delete_position(portfolio_id: int, position_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    deleted = service.delete_position(db, portfolio_id, position_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="position not found")
    return {"success": True}


@router.post("/{portfolio_id}/positions/refresh-quotes")
def refresh_position_quotes(portfolio_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        return service.refresh_position_quotes(db, portfolio_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{portfolio_id}/cash", response_model=PortfolioCashRead)
def get_cash_balance(portfolio_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        return service.get_cash_balance(db, portfolio_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{portfolio_id}/cash", response_model=PortfolioCashRead)
def update_cash_balance(portfolio_id: int, payload: PortfolioCashUpdate, db: Session = Depends(get_db)) -> dict:
    try:
        return service.update_cash_balance(db, portfolio_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{portfolio_id}/cash-flows", response_model=list[PortfolioCashFlowRead])
def list_cash_flows(portfolio_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_cash_flows(db, portfolio_id)


@router.post("/{portfolio_id}/cash-flows", response_model=PortfolioCashFlowRead)
def create_cash_flow(portfolio_id: int, payload: PortfolioCashFlowCreate, db: Session = Depends(get_db)):
    try:
        return service.create_cash_flow(db, portfolio_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{portfolio_id}/review", response_model=list[PortfolioReviewRead])
def list_reviews(portfolio_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_reviews(db, portfolio_id)


@router.post("/{portfolio_id}/review", response_model=PortfolioReviewRead)
def create_review(portfolio_id: int, payload: PortfolioReviewCreate, db: Session = Depends(get_db)):
    return service.create_review(db, portfolio_id, payload)
