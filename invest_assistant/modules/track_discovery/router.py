from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.track_discovery import service
from invest_assistant.modules.track_discovery.schemas import (
    TrackAliasCreate,
    TrackAliasRead,
    TrackCreate,
    TrackEvidenceCreate,
    TrackEvidenceRead,
    TrackRelatedStockCreate,
    TrackRelatedStockRead,
    TrackStatusChange,
    TrackRead,
    TrackThesisCreate,
    TrackThesisRead,
    TrackUpdate,
    TrackValidationIndicatorCreate,
    TrackValidationIndicatorRead,
)
from invest_assistant.modules.stock_analysis import service as stock_analysis_service
from invest_assistant.modules.stock_analysis.schemas import (
    StockTrackRelationCreate,
    StockTrackRelationRead,
    TrackStockRelationCreate,
)

router = APIRouter(prefix="/api/track-discovery", tags=["track_discovery"], dependencies=[Depends(get_current_user)])


@router.get("/tracks", response_model=list[TrackRead])
def list_tracks(status: str | None = None, db: Session = Depends(get_db)) -> list:
    return service.list_tracks(db, status)


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


@router.get("/tracks/{track_id}/aliases", response_model=list[TrackAliasRead])
def list_track_aliases(track_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_aliases(db, track_id)


@router.post("/tracks/{track_id}/aliases", response_model=TrackAliasRead)
def create_track_alias(track_id: int, payload: TrackAliasCreate, db: Session = Depends(get_db)):
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.create_alias(db, track_id, payload)


@router.get("/tracks/{track_id}/theses", response_model=list[TrackThesisRead])
def list_track_theses(track_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_theses(db, track_id)


@router.post("/tracks/{track_id}/theses", response_model=TrackThesisRead)
def create_track_thesis(
    track_id: int,
    payload: TrackThesisCreate,
    db: Session = Depends(get_db),
    user: UserAccount = Depends(get_current_user),
):
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.create_thesis(db, track_id, payload, user.id)


@router.get("/tracks/{track_id}/indicators", response_model=list[TrackValidationIndicatorRead])
def list_track_indicators(track_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_indicators(db, track_id)


@router.post("/tracks/{track_id}/indicators", response_model=TrackValidationIndicatorRead)
def add_track_indicator(track_id: int, payload: TrackValidationIndicatorCreate, db: Session = Depends(get_db)):
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.add_indicator(db, track_id, payload)


@router.get("/tracks/{track_id}/evidence", response_model=list[TrackEvidenceRead])
def list_track_evidence(track_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_evidence(db, track_id)


@router.post("/tracks/{track_id}/evidence", response_model=TrackEvidenceRead)
def add_track_evidence(track_id: int, payload: TrackEvidenceCreate, db: Session = Depends(get_db)):
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.add_evidence(db, track_id, payload)


@router.get("/tracks/{track_id}/related-stocks", response_model=list[TrackRelatedStockRead])
def list_track_related_stocks(track_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_related_stocks(db, track_id)


@router.post("/tracks/{track_id}/related-stocks", response_model=TrackRelatedStockRead)
def add_track_related_stock(track_id: int, payload: TrackRelatedStockCreate, db: Session = Depends(get_db)):
    if service.get_track(db, track_id) is None:
        raise HTTPException(status_code=404, detail="track not found")
    return service.add_related_stock(db, track_id, payload)


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
