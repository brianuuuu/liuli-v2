from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.schemas import (
    SourceItemCreate,
    SourceItemRead,
    TagCandidateCreate,
    TagCandidateRead,
    TagCreate,
    TagRead,
    TagUpdate,
)

router = APIRouter(prefix="/api/market-radar", tags=["market_radar"], dependencies=[Depends(get_current_user)])


@router.get("/overview")
def overview(db: Session = Depends(get_db)) -> dict[str, int]:
    return {
        "source_items": len(service.list_source_items(db)),
        "tags": len(service.list_tags(db)),
        "tag_candidates": len(service.list_candidates(db)),
    }


@router.get("/source-items", response_model=list[SourceItemRead])
def list_source_items(db: Session = Depends(get_db)) -> list:
    return service.list_source_items(db)


@router.post("/source-items", response_model=SourceItemRead)
def create_source_item(payload: SourceItemCreate, db: Session = Depends(get_db)):
    return service.create_source_item(db, payload)


@router.get("/source-items/{source_item_id}", response_model=SourceItemRead)
def get_source_item(source_item_id: int, db: Session = Depends(get_db)):
    item = service.get_source_item(db, source_item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="source item not found")
    return item


@router.get("/tags", response_model=list[TagRead])
def list_tags(type: str | None = None, db: Session = Depends(get_db)) -> list:
    return service.list_tags(db, type)


@router.post("/tags", response_model=TagRead)
def create_tag(payload: TagCreate, db: Session = Depends(get_db)):
    return service.create_tag(db, payload)


@router.get("/tags/{tag_id}", response_model=TagRead)
def get_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = service.get_tag(db, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    return tag


@router.put("/tags/{tag_id}", response_model=TagRead)
def update_tag(tag_id: int, payload: TagUpdate, db: Session = Depends(get_db)):
    tag = service.get_tag(db, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    return service.update_tag(db, tag, payload)


@router.delete("/tags/{tag_id}", response_model=TagRead)
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = service.get_tag(db, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    return service.disable_tag(db, tag)


@router.get("/tags/{tag_id}/trend")
def tag_trend(tag_id: int, db: Session = Depends(get_db)) -> list:
    return service.tag_trend(db, tag_id)


@router.get("/tags/{tag_id}/sources")
def tag_sources(tag_id: int) -> list:
    return []


@router.get("/rankings")
def rankings(type: str, window: str = "24h", db: Session = Depends(get_db)) -> list:
    return service.latest_rankings(db, type, window)


@router.get("/graphs/stock-track")
def stock_track_graph(window: str = "24h", db: Session = Depends(get_db)) -> dict:
    return service.graph_edges(db, "track", window)


@router.get("/graphs/stock-hotword")
def stock_hotword_graph(window: str = "24h", db: Session = Depends(get_db)) -> dict:
    return service.graph_edges(db, "hotword", window)


@router.get("/tag-candidates", response_model=list[TagCandidateRead])
def list_candidates(db: Session = Depends(get_db)) -> list:
    return service.list_candidates(db)


@router.post("/tag-candidates", response_model=TagCandidateRead)
def create_candidate(payload: TagCandidateCreate, db: Session = Depends(get_db)):
    return service.create_candidate(db, payload)


@router.post("/tag-candidates/{candidate_id}/approve", response_model=TagCandidateRead)
def approve_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = service.get_candidate(db, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="candidate not found")
    return service.approve_candidate(db, candidate)


@router.post("/tag-candidates/{candidate_id}/reject", response_model=TagCandidateRead)
def reject_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = service.get_candidate(db, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="candidate not found")
    return service.reject_candidate(db, candidate)


@router.post("/tag-candidates/{candidate_id}/merge", response_model=TagCandidateRead)
def merge_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = service.get_candidate(db, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="candidate not found")
    return service.merge_candidate(db, candidate)
