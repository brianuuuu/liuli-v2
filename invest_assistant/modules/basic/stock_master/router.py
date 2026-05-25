from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.stock_master import service
from invest_assistant.modules.basic.stock_master.schemas import (
    StockTagRelationCreate,
    StockTagRelationRead,
    StockImportItem,
    StockRead,
    StockUpdate,
)

router = APIRouter(prefix="/api/stocks", tags=["stock_master"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[StockRead])
def list_stocks(db: Session = Depends(get_db), limit: int = 100, offset: int = 0) -> list:
    return service.list_stock_records(db, limit=limit, offset=offset)


@router.get("/search", response_model=list[StockRead])
def search_stocks(keyword: str, db: Session = Depends(get_db)) -> list:
    return service.search_stock_records(db, keyword)


@router.post("/import", response_model=list[StockRead])
def import_stocks(items: list[StockImportItem], db: Session = Depends(get_db)) -> list:
    return service.import_stocks(db, items)


@router.get("/{stock_id}", response_model=StockRead)
def get_stock(stock_id: int, db: Session = Depends(get_db)):
    stock = service.get_stock(db, stock_id)
    if stock is None:
        raise HTTPException(status_code=404, detail="stock not found")
    return service.stock_to_dict(db, stock)


@router.put("/{stock_id}", response_model=StockRead)
def update_stock(stock_id: int, payload: StockUpdate, db: Session = Depends(get_db)):
    stock = service.get_stock(db, stock_id)
    if stock is None:
        raise HTTPException(status_code=404, detail="stock not found")
    return service.stock_to_dict(db, service.update_stock(db, stock, payload))


@router.get("/{stock_id}/stock-tag-relations", response_model=list[StockTagRelationRead])
def list_stock_tag_relations(stock_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_stock_tag_relations(db, stock_id)


@router.post("/{stock_id}/stock-tag-relations", response_model=StockTagRelationRead)
def create_stock_tag_relation(stock_id: int, payload: StockTagRelationCreate, db: Session = Depends(get_db)):
    if service.get_stock(db, stock_id) is None:
        raise HTTPException(status_code=404, detail="stock not found")
    return service.create_stock_tag_relation(db, stock_id, payload.tag_id, payload.source, payload.status)
