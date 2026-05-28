from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.schemas import (
    AiTagSuggestionApprove,
    AiTagSuggestionCreate,
    AiTagSuggestionRead,
    HotwordCreate,
    HotwordRead,
    MarketFlashSyncCreate,
    MarketFlashSyncResult,
    SourceItemCreate,
    SourceItemRead,
    TagBindingCreate,
    TagBindingRead,
    TagCreate,
    TagRead,
    TagUpdate,
)
from invest_assistant.modules.basic.job_center.dispatcher import execute_job

router = APIRouter(prefix="/api/market-radar", tags=["market_radar"], dependencies=[Depends(get_current_user)])


@router.get("/overview")
def overview(db: Session = Depends(get_db)) -> dict[str, int]:
    return {
        "source_items": service.count_source_items(db),
        "tags": len(service.list_tags(db)),
        "ai_tag_suggestions": len(service.list_ai_tag_suggestions(db)),
    }


@router.get("/source-items", response_model=list[SourceItemRead])
def list_source_items(
    limit: int = Query(200, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list:
    return service.list_source_items(db, limit=limit, offset=offset)


@router.post("/source-items", response_model=SourceItemRead)
def create_source_item(payload: SourceItemCreate, db: Session = Depends(get_db)):
    return service.create_source_item(db, payload)


@router.post("/source-items/sync-cls", response_model=MarketFlashSyncResult)
def sync_cls_market_flashes(payload: MarketFlashSyncCreate, db: Session = Depends(get_db)):
    result = execute_job(db, "market_radar.fetch_news", {"limit": payload.limit}, "manual")
    return MarketFlashSyncResult(
        success=result.success,
        message=result.message,
        fetched_count=result.fetched_count,
        inserted_count=result.inserted_count,
        skipped_count=result.skipped_count,
    )


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
    raise HTTPException(status_code=400, detail="tags are system projections; approve candidates to create hotwords")


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


@router.post("/hotwords", response_model=HotwordRead)
def create_hotword(payload: HotwordCreate, db: Session = Depends(get_db)):
    return service.create_hotword(db, payload)


@router.get("/hotwords", response_model=list[HotwordRead])
def list_hotwords(status: str | None = None, db: Session = Depends(get_db)) -> list:
    return service.list_hotwords(db, status)


@router.get("/hotwords/{hotword_id}/tags", response_model=list[TagBindingRead])
def list_hotword_tags(hotword_id: int, db: Session = Depends(get_db)) -> list:
    return service.list_hotword_tag_bindings(db, hotword_id)


@router.post("/hotwords/{hotword_id}/tags", response_model=TagBindingRead)
def bind_hotword_tag(hotword_id: int, payload: TagBindingCreate, db: Session = Depends(get_db)):
    if service.get_hotword(db, hotword_id) is None:
        raise HTTPException(status_code=404, detail="hotword not found")
    return service.bind_hotword_tag(db, hotword_id, payload)


@router.delete("/hotwords/tag-relations/{relation_id}", response_model=TagBindingRead)
def delete_hotword_tag(relation_id: int, db: Session = Depends(get_db)):
    binding = service.disable_hotword_tag_binding(db, relation_id)
    if binding is None:
        raise HTTPException(status_code=404, detail="binding not found")
    return binding


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


@router.get("/ai-tag-suggestions", response_model=list[AiTagSuggestionRead])
def list_ai_tag_suggestions(db: Session = Depends(get_db)) -> list:
    return service.list_ai_tag_suggestions(db)


@router.post("/ai-tag-suggestions", response_model=AiTagSuggestionRead)
def create_ai_tag_suggestion(payload: AiTagSuggestionCreate, db: Session = Depends(get_db)):
    return service.create_ai_tag_suggestion(db, payload)


@router.post("/ai-tag-suggestions/{suggestion_id}/approve", response_model=AiTagSuggestionRead)
def approve_ai_tag_suggestion(suggestion_id: int, payload: AiTagSuggestionApprove, db: Session = Depends(get_db)):
    suggestion = service.get_ai_tag_suggestion(db, suggestion_id)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="suggestion not found")
    try:
        return service.approve_ai_tag_suggestion(db, suggestion, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/ai-tag-suggestions/{suggestion_id}/reject", response_model=AiTagSuggestionRead)
def reject_ai_tag_suggestion(suggestion_id: int, db: Session = Depends(get_db)):
    suggestion = service.get_ai_tag_suggestion(db, suggestion_id)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="suggestion not found")
    return service.reject_ai_tag_suggestion(db, suggestion)


@router.post("/ai-tag-suggestions/{suggestion_id}/restore", response_model=AiTagSuggestionRead)
def restore_ai_tag_suggestion(suggestion_id: int, db: Session = Depends(get_db)):
    suggestion = service.get_ai_tag_suggestion(db, suggestion_id)
    if suggestion is None:
        raise HTTPException(status_code=404, detail="suggestion not found")
    try:
        return service.restore_ai_tag_suggestion(db, suggestion)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
