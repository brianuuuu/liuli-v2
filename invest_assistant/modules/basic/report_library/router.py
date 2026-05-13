from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.report_library import service
from invest_assistant.modules.basic.report_library.schemas import ReportCreate, ReportRead, ReportUpdate

router = APIRouter(prefix="/api/reports", tags=["report_library"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ReportRead])
def list_reports(db: Session = Depends(get_db)) -> list:
    return service.list_reports(db)


@router.post("", response_model=ReportRead)
def create_report(payload: ReportCreate, db: Session = Depends(get_db)):
    return service.create_report(db, payload)


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: int, db: Session = Depends(get_db)):
    item = service.get_report(db, report_id)
    if item is None:
        raise HTTPException(status_code=404, detail="report not found")
    return item


@router.put("/{report_id}", response_model=ReportRead)
def update_report(report_id: int, payload: ReportUpdate, db: Session = Depends(get_db)):
    item = service.get_report(db, report_id)
    if item is None:
        raise HTTPException(status_code=404, detail="report not found")
    return service.update_report(db, item, payload)


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = service.get_report(db, report_id)
    if item is None:
        raise HTTPException(status_code=404, detail="report not found")
    service.delete_report(db, item)
    return {"success": True}


@router.get("/{report_id}/content")
def report_content(report_id: int, db: Session = Depends(get_db)):
    item = service.get_report(db, report_id)
    if item is None:
        raise HTTPException(status_code=404, detail="report not found")
    path = service.resolve_report_path(item)
    if not path.exists():
        raise HTTPException(status_code=404, detail="report file not found")
    return PlainTextResponse(path.read_text(encoding="utf-8"))


@router.get("/{report_id}/download")
def report_download(report_id: int, db: Session = Depends(get_db)):
    item = service.get_report(db, report_id)
    if item is None:
        raise HTTPException(status_code=404, detail="report not found")
    path = service.resolve_report_path(item)
    if not path.exists():
        raise HTTPException(status_code=404, detail="report file not found")
    return FileResponse(path)
