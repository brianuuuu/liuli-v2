from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.stock_analysis import service
from invest_assistant.modules.stock_analysis.schemas import (
    StockCompareGroupCreate,
    StockCompareGroupRead,
    StockPoolCreate,
    StockPoolRead,
    StockResearchNoteCreate,
    StockResearchNoteRead,
    StockScoreSnapshotCreate,
    StockScoreSnapshotRead,
)

router = APIRouter(prefix="/api/stock-analysis", tags=["stock_analysis"], dependencies=[Depends(get_current_user)])


@router.get("/pool", response_model=list[StockPoolRead])
def list_pool(db: Session = Depends(get_db)) -> list:
    return service.list_pool(db)


@router.post("/pool", response_model=StockPoolRead)
def create_pool_item(payload: StockPoolCreate, db: Session = Depends(get_db)):
    return service.create_pool_item(db, payload)


@router.put("/pool/{pool_id}", response_model=StockPoolRead)
def update_pool_item(pool_id: int, payload: StockPoolCreate, db: Session = Depends(get_db)):
    return service.create_pool_item(db, payload)


@router.get("/stocks/{stock_id}")
def stock_home(stock_id: int) -> dict[str, int]:
    return {"stock_id": stock_id}


@router.get("/stocks/{stock_id}/notes", response_model=list[StockResearchNoteRead])
def list_notes(stock_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_notes(db, stock_id)


@router.post("/stocks/{stock_id}/notes", response_model=StockResearchNoteRead)
def create_note(stock_id: int, payload: StockResearchNoteCreate, db: Session = Depends(get_db)):
    return service.create_note(db, stock_id, payload)


@router.get("/stocks/{stock_id}/scores", response_model=list[StockScoreSnapshotRead])
def list_scores(stock_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_scores(db, stock_id)


@router.post("/stocks/{stock_id}/scores", response_model=StockScoreSnapshotRead)
def create_score(stock_id: int, payload: StockScoreSnapshotCreate, db: Session = Depends(get_db)):
    return service.create_score(db, stock_id, payload)


@router.get("/compare-groups", response_model=list[StockCompareGroupRead])
def list_compare_groups(db: Session = Depends(get_db)) -> list:
    return service.list_compare_groups(db)


@router.post("/compare-groups", response_model=StockCompareGroupRead)
def create_compare_group(payload: StockCompareGroupCreate, db: Session = Depends(get_db)):
    return service.create_compare_group(db, payload)


@router.get("/reports")
def reports() -> list:
    return []
