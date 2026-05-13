from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.track_discovery import service
from invest_assistant.modules.track_discovery.schemas import (
    TrackEvidenceCreate,
    TrackEvidenceRead,
    TrackRelatedStockCreate,
    TrackRelatedStockRead,
    TrackStatusChange,
    TrackThesisCreate,
    TrackThesisRead,
    TrackThesisUpdate,
    TrackValidationIndicatorCreate,
    TrackValidationIndicatorRead,
)

router = APIRouter(prefix="/api/track-discovery", tags=["track_discovery"], dependencies=[Depends(get_current_user)])


@router.get("/theses", response_model=list[TrackThesisRead])
def list_theses(db: Session = Depends(get_db)) -> list:
    return service.list_theses(db)


@router.post("/theses", response_model=TrackThesisRead)
def create_thesis(
    payload: TrackThesisCreate,
    db: Session = Depends(get_db),
    user: UserAccount = Depends(get_current_user),
):
    return service.create_thesis(db, payload, user.id)


@router.get("/theses/{thesis_id}", response_model=TrackThesisRead)
def get_thesis(thesis_id: int, db: Session = Depends(get_db)):
    thesis = service.get_thesis(db, thesis_id)
    if thesis is None:
        raise HTTPException(status_code=404, detail="track thesis not found")
    return thesis


@router.put("/theses/{thesis_id}", response_model=TrackThesisRead)
def update_thesis(thesis_id: int, payload: TrackThesisUpdate, db: Session = Depends(get_db)):
    thesis = service.get_thesis(db, thesis_id)
    if thesis is None:
        raise HTTPException(status_code=404, detail="track thesis not found")
    return service.update_thesis(db, thesis, payload)


@router.delete("/theses/{thesis_id}", response_model=TrackThesisRead)
def delete_thesis(thesis_id: int, db: Session = Depends(get_db)):
    thesis = service.get_thesis(db, thesis_id)
    if thesis is None:
        raise HTTPException(status_code=404, detail="track thesis not found")
    return service.archive_thesis(db, thesis)


@router.get("/theses/{thesis_id}/indicators", response_model=list[TrackValidationIndicatorRead])
def list_indicators(thesis_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_indicators(db, thesis_id)


@router.post("/theses/{thesis_id}/indicators", response_model=TrackValidationIndicatorRead)
def add_indicator(thesis_id: int, payload: TrackValidationIndicatorCreate, db: Session = Depends(get_db)):
    if service.get_thesis(db, thesis_id) is None:
        raise HTTPException(status_code=404, detail="track thesis not found")
    return service.add_indicator(db, thesis_id, payload)


@router.get("/theses/{thesis_id}/evidence", response_model=list[TrackEvidenceRead])
def list_evidence(thesis_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_evidence(db, thesis_id)


@router.post("/theses/{thesis_id}/evidence", response_model=TrackEvidenceRead)
def add_evidence(thesis_id: int, payload: TrackEvidenceCreate, db: Session = Depends(get_db)):
    if service.get_thesis(db, thesis_id) is None:
        raise HTTPException(status_code=404, detail="track thesis not found")
    return service.add_evidence(db, thesis_id, payload)


@router.get("/theses/{thesis_id}/related-stocks", response_model=list[TrackRelatedStockRead])
def list_related_stocks(thesis_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_related_stocks(db, thesis_id)


@router.post("/theses/{thesis_id}/related-stocks", response_model=TrackRelatedStockRead)
def add_related_stock(thesis_id: int, payload: TrackRelatedStockCreate, db: Session = Depends(get_db)):
    if service.get_thesis(db, thesis_id) is None:
        raise HTTPException(status_code=404, detail="track thesis not found")
    return service.add_related_stock(db, thesis_id, payload)


@router.post("/theses/{thesis_id}/status", response_model=TrackThesisRead)
def change_status(thesis_id: int, payload: TrackStatusChange, db: Session = Depends(get_db)):
    thesis = service.get_thesis(db, thesis_id)
    if thesis is None:
        raise HTTPException(status_code=404, detail="track thesis not found")
    return service.change_status(db, thesis, payload)


@router.get("/candidates")
def candidates(window: str = "24h", db: Session = Depends(get_db)) -> list:
    return service.market_radar_candidates(db, window)
