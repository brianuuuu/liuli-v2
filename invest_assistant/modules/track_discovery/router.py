from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.track_discovery import service
from invest_assistant.modules.track_discovery.schemas import (
    TrackAnalysisSnapshotCreate,
    TrackAnalysisSnapshotRead,
    TrackCreate,
    TrackMaterialCreate,
    TrackMaterialRead,
    TrackMaterialUpdate,
    TrackStatusChange,
    TrackRead,
    TrackUpdate,
)
from invest_assistant.modules.stock_analysis import service as stock_analysis_service
from invest_assistant.modules.stock_analysis.schemas import (
    StockTrackRelationCreate,
    StockTrackRelationRead,
    TrackStockRelationCreate,
)
from invest_assistant.modules.market_radar.schemas import TagBindingCreate, TagBindingRead
from invest_assistant.modules.market_radar import service as market_radar_service

router = APIRouter(prefix="/api/track-discovery", tags=["track_discovery"], dependencies=[Depends(get_current_user)])


@router.get("/tracks", response_model=list[TrackRead])
def list_tracks(status: str | None = None, db: Session = Depends(get_db)) -> list:
    return service.list_tracks(db, status)


@router.get("/dashboard")
def track_dashboard(db: Session = Depends(get_db)) -> dict:
    return service.get_dashboard(db)


@router.post("/tracks", response_model=TrackRead)
def create_track(payload: TrackCreate, db: Session = Depends(get_db)):
    return service.create_track(db, payload)


@router.get("/tracks/{track_id}", response_model=TrackRead)
def get_track(track_id: int, db: Session = Depends(get_db)):
    track = service.get_track(db, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="track not found")
    return track


@router.put("/tracks/{track_id}", response_model=TrackRead)
def update_track(track_id: int, payload: TrackUpdate, db: Session = Depends(get_db)):
    track = service.update_track(db, track_id, payload)
    if track is None:
        raise HTTPException(status_code=404, detail="track not found")
    return track


@router.delete("/tracks/{track_id}", status_code=204)
def delete_track(track_id: int, db: Session = Depends(get_db)):
    try:
        deleted = service.delete_candidate_track(db, track_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="track not found")
    return Response(status_code=204)


@router.get("/tracks/{track_id}/tags", response_model=list[TagBindingRead])
def list_track_tags(track_id: int, db: Session = Depends(get_db)) -> list:
    return market_radar_service.list_track_tag_bindings(db, track_id)


@router.post("/tracks/{track_id}/tags", response_model=TagBindingRead)
def bind_track_tag(track_id: int, payload: TagBindingCreate, db: Session = Depends(get_db)):
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return market_radar_service.bind_track_tag(db, track_id, payload)


@router.delete("/tracks/tag-relations/{relation_id}", response_model=TagBindingRead)
def delete_track_tag(relation_id: int, db: Session = Depends(get_db)):
    binding = market_radar_service.disable_track_tag_binding(db, relation_id)
    if binding is None:
        raise HTTPException(status_code=404, detail="binding not found")
    return binding


@router.get("/tracks/{track_id}/materials", response_model=list[TrackMaterialRead])
def list_track_materials(track_id: int, db: Session = Depends(get_db)) -> list:
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.list_materials(db, track_id)


@router.post("/tracks/{track_id}/materials", response_model=TrackMaterialRead)
def add_track_material(track_id: int, payload: TrackMaterialCreate, db: Session = Depends(get_db)):
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.create_material(db, track_id, payload)


@router.put("/tracks/materials/{material_id}", response_model=TrackMaterialRead)
def update_track_material(material_id: int, payload: TrackMaterialUpdate, db: Session = Depends(get_db)):
    material = service.update_material(db, material_id, payload)
    if material is None:
        raise HTTPException(status_code=404, detail="material not found")
    return material


@router.get("/tracks/{track_id}/analysis-snapshots", response_model=list[TrackAnalysisSnapshotRead])
def list_track_analysis_snapshots(track_id: int, db: Session = Depends(get_db)) -> list:
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.list_analysis_snapshots(db, track_id)


@router.post("/tracks/{track_id}/analysis-snapshots", response_model=TrackAnalysisSnapshotRead)
def add_track_analysis_snapshot(track_id: int, payload: TrackAnalysisSnapshotCreate, db: Session = Depends(get_db)):
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.create_analysis_snapshot(db, track_id, payload)


@router.post("/tracks/{track_id}/status", response_model=TrackRead)
def change_track_status(track_id: int, payload: TrackStatusChange, db: Session = Depends(get_db)):
    track = service.change_track_status(db, track_id, payload)
    if track is None:
        raise HTTPException(status_code=404, detail="track not found")
    return track


@router.get("/tracks/{track_id}/stocks", response_model=list[StockTrackRelationRead])
def list_stocks_for_track(track_id: int, db: Session = Depends(get_db)) -> list:
    return stock_analysis_service.list_stocks_for_track(db, track_id)


@router.post("/tracks/{track_id}/stocks", response_model=StockTrackRelationRead)
def bind_stock_from_track(track_id: int, payload: TrackStockRelationCreate, db: Session = Depends(get_db)):
    try:
        return stock_analysis_service.bind_track(
            db,
            payload.stock_id,
            StockTrackRelationCreate(
                track_id=track_id,
                relation_type=payload.relation_type,
                conviction=payload.conviction,
                reason=payload.reason,
                status=payload.status,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
