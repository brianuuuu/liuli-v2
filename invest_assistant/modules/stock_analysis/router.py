from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
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
    StockScoreComparisonRead,
    StockScoreSnapshotCreate,
    StockScoreSnapshotRead,
    StockTrackRelationCreate,
    StockTrackRelationRead,
    StockTrackRelationUpdate,
    StockValuationComparisonRead,
    StockMaterialCreate,
    StockMaterialUpdate,
    StockMaterialRead,
    StockDashboardRead,
    StockDetailRead,
    StockDailyBarRead,
)
from invest_assistant.modules.market_radar.schemas import TagBindingCreate, TagBindingRead
from invest_assistant.modules.market_radar import service as market_radar_service
from invest_assistant.shared.pagination import Page

router = APIRouter(prefix="/api/stock-analysis", tags=["stock_analysis"], dependencies=[Depends(get_current_user)])


def _parse_status_filter(status: str | None) -> list[str] | None:
    if status is None:
        return None
    values = [item.strip() for item in status.split(",") if item.strip()]
    if not values or values == ["all"]:
        return None
    return list(dict.fromkeys(values))


@router.get("/dashboard", response_model=StockDashboardRead)
def get_dashboard(stock_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    return service.get_dashboard(db, selected_stock_id=stock_id)


@router.get("/pool", response_model=list[StockPoolRead])
def list_pool(db: Session = Depends(get_db)) -> list:
    return service.list_pool(db)


@router.post("/pool", response_model=StockPoolRead)
def create_pool_item(payload: StockPoolCreate, db: Session = Depends(get_db)):
    try:
        return service.create_pool_item(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/pool/{pool_id}", response_model=StockPoolRead)
def update_pool_item(pool_id: int, payload: StockPoolCreate, db: Session = Depends(get_db)):
    try:
        item = service.update_pool_item(db, pool_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if item is None:
        raise HTTPException(status_code=404, detail="pool item not found")
    return item


@router.get("/candidates", response_model=list[StockPoolRead])
def list_candidates(db: Session = Depends(get_db)) -> list:
    return service.list_candidates(db)


@router.get("/stocks/{stock_id}")
def stock_home(stock_id: int) -> dict[str, int]:
    return {"stock_id": stock_id}


@router.get("/stocks/{stock_id}/detail", response_model=StockDetailRead)
def stock_detail(stock_id: int, db: Session = Depends(get_db)) -> dict:
    detail = service.get_stock_detail(db, stock_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="stock not found")
    return detail


@router.get("/stocks/{stock_id}/daily-bars", response_model=list[StockDailyBarRead])
def stock_daily_bars(
    stock_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    refresh: bool = False,
    db: Session = Depends(get_db),
) -> list:
    try:
        rows = service.list_stock_daily_bars(
            db,
            stock_id,
            start_date=start_date,
            end_date=end_date,
            refresh=refresh,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if rows is None:
        raise HTTPException(status_code=404, detail="stock not found")
    return rows


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


@router.get("/score-comparison", response_model=list[StockScoreComparisonRead])
def list_score_comparison(db: Session = Depends(get_db)) -> list:
    return service.list_score_comparison(db)


@router.get("/valuation-comparison", response_model=list[StockValuationComparisonRead])
def list_valuation_comparison(db: Session = Depends(get_db)) -> list:
    return service.list_valuation_comparison(db)


@router.get("/compare-groups", response_model=list[StockCompareGroupRead])
def list_compare_groups(db: Session = Depends(get_db)) -> list:
    return service.list_compare_groups(db)


@router.post("/compare-groups", response_model=StockCompareGroupRead)
def create_compare_group(payload: StockCompareGroupCreate, db: Session = Depends(get_db)):
    return service.create_compare_group(db, payload)


@router.get("/reports")
def reports() -> list:
    return []


@router.get("/stocks/{stock_id}/tracks", response_model=list[StockTrackRelationRead])
def list_stock_tracks(stock_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_track_relations(db, stock_id)


@router.get("/stocks/{stock_id}/tags", response_model=list[TagBindingRead])
def list_stock_tags(stock_id: int, db: Session = Depends(get_db)) -> list:
    return market_radar_service.list_stock_tag_bindings(db, stock_id)


@router.post("/stocks/{stock_id}/tags", response_model=TagBindingRead)
def bind_stock_tag(stock_id: int, payload: TagBindingCreate, db: Session = Depends(get_db)):
    return market_radar_service.bind_stock_tag(db, stock_id, payload)


@router.delete("/stocks/tag-relations/{relation_id}", response_model=TagBindingRead)
def delete_stock_tag(relation_id: int, db: Session = Depends(get_db)):
    binding = market_radar_service.disable_stock_tag_binding(db, relation_id)
    if binding is None:
        raise HTTPException(status_code=404, detail="binding not found")
    return binding


@router.post("/stocks/{stock_id}/tracks", response_model=StockTrackRelationRead)
def bind_stock_track(stock_id: int, payload: StockTrackRelationCreate, db: Session = Depends(get_db)):
    try:
        return service.bind_track(db, stock_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/track-relations/{relation_id}", response_model=StockTrackRelationRead)
def update_stock_track_relation(relation_id: int, payload: StockTrackRelationUpdate, db: Session = Depends(get_db)):
    binding = service.update_track_relation(db, relation_id, payload)
    if binding is None:
        raise HTTPException(status_code=404, detail="binding not found")
    return binding


@router.delete("/track-relations/{relation_id}", response_model=StockTrackRelationRead)
def disable_stock_track_relation(relation_id: int, db: Session = Depends(get_db)):
    binding = service.disable_track_relation(db, relation_id)
    if binding is None:
        raise HTTPException(status_code=404, detail="binding not found")
    return binding


@router.get("/materials", response_model=Page[StockMaterialRead])
def list_all_stock_materials(
    stock_id: int | None = None,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Page[dict]:
    return service.list_all_stock_materials_page(
        db,
        stock_id=stock_id,
        statuses=_parse_status_filter(status),
        limit=limit,
        offset=offset,
    )


@router.get("/stocks/{stock_id}/materials", response_model=Page[StockMaterialRead])
def list_stock_materials(
    stock_id: int,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Page[dict]:
    return service.list_stock_materials_page(
        db,
        stock_id,
        statuses=_parse_status_filter(status),
        limit=limit,
        offset=offset,
    )


@router.post("/stocks/{stock_id}/materials", response_model=StockMaterialRead)
def add_stock_material(stock_id: int, payload: StockMaterialCreate, db: Session = Depends(get_db)):
    return service.create_stock_material(db, stock_id, payload)


@router.put("/materials/{material_id}", response_model=StockMaterialRead)
def update_stock_material(material_id: int, payload: StockMaterialUpdate, db: Session = Depends(get_db)):
    material = service.update_stock_material(db, material_id, payload)
    if material is None:
        raise HTTPException(status_code=404, detail="material not found")
    return material
