from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.disclosure_library import service
from invest_assistant.modules.basic.disclosure_library.schemas import (
    CompanyDisclosureCreate,
    CompanyDisclosureRead,
    CompanyDisclosureUpdate,
)
from invest_assistant.shared.pagination import Page

router = APIRouter(prefix="/api/disclosures", tags=["disclosure_library"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=Page[CompanyDisclosureRead])
def list_disclosures(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Page[CompanyDisclosureRead]:
    return service.list_disclosures_page(db, limit=limit, offset=offset)


@router.post("", response_model=CompanyDisclosureRead)
def create_disclosure(payload: CompanyDisclosureCreate, db: Session = Depends(get_db)):
    return service.create_disclosure(db, payload)


@router.post("/fetch")
def fetch_disclosures(
    keyword: str = "",
    page_num: int = 1,
    page_size: int = 30,
    db: Session = Depends(get_db),
) -> dict[str, int]:
    items = service.fetch_cninfo(db, keyword=keyword, page_num=page_num, page_size=page_size)
    return {"fetched": len(items)}


@router.post("/to-source-items-missing")
def to_missing_source_items(db: Session = Depends(get_db)) -> dict[str, int]:
    return service.disclosures_to_missing_source_items(db)


@router.get("/{disclosure_id}", response_model=CompanyDisclosureRead)
def get_disclosure(disclosure_id: int, db: Session = Depends(get_db)):
    item = service.get_disclosure(db, disclosure_id)
    if item is None:
        raise HTTPException(status_code=404, detail="disclosure not found")
    return item


@router.put("/{disclosure_id}", response_model=CompanyDisclosureRead)
def update_disclosure(disclosure_id: int, payload: CompanyDisclosureUpdate, db: Session = Depends(get_db)):
    item = service.get_disclosure(db, disclosure_id)
    if item is None:
        raise HTTPException(status_code=404, detail="disclosure not found")
    return service.update_disclosure(db, item, payload)


@router.post("/{disclosure_id}/download")
def download_disclosure(disclosure_id: int, db: Session = Depends(get_db)):
    item = service.get_disclosure(db, disclosure_id)
    if item is None:
        raise HTTPException(status_code=404, detail="disclosure not found")
    try:
        return service.download_disclosure_file(db, item)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{disclosure_id}/parse")
def parse_disclosure(disclosure_id: int, db: Session = Depends(get_db)):
    item = service.get_disclosure(db, disclosure_id)
    if item is None:
        raise HTTPException(status_code=404, detail="disclosure not found")
    try:
        return service.parse_disclosure_file(db, item)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{disclosure_id}/file")
def disclosure_file(disclosure_id: int, db: Session = Depends(get_db)):
    item = service.get_disclosure(db, disclosure_id)
    if item is None:
        raise HTTPException(status_code=404, detail="disclosure not found")
    path = service.resolve_path(item.file_path)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="disclosure file not found")
    return FileResponse(path)


@router.get("/{disclosure_id}/parsed")
def parsed_disclosure(disclosure_id: int, db: Session = Depends(get_db)):
    item = service.get_disclosure(db, disclosure_id)
    if item is None:
        raise HTTPException(status_code=404, detail="disclosure not found")
    path = service.resolve_path(item.parsed_markdown_path or item.parsed_text_path)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="parsed disclosure not found")
    return PlainTextResponse(path.read_text(encoding="utf-8"))


@router.post("/{disclosure_id}/to-source-item")
def to_source_item(disclosure_id: int, db: Session = Depends(get_db)):
    item = service.get_disclosure(db, disclosure_id)
    if item is None:
        raise HTTPException(status_code=404, detail="disclosure not found")
    return service.disclosure_to_source_item(db, item)


@router.post("/{disclosure_id}/to-track-material")
def to_track_material(disclosure_id: int) -> dict[str, str]:
    raise HTTPException(status_code=501, detail="track material integration is not implemented in phase 1")


@router.post("/{disclosure_id}/to-stock-analysis")
def to_stock_analysis(disclosure_id: int, db: Session = Depends(get_db)) -> dict:
    item = service.get_disclosure(db, disclosure_id)
    if item is None:
        raise HTTPException(status_code=404, detail="disclosure not found")
    try:
        return service.disclosure_to_stock_analysis(db, item)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
