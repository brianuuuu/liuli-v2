from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.modules.basic.report_library.schemas import ReportCreate, ReportUpdate
from invest_assistant.shared.pagination import Page, page_from_statement


def list_reports(db: Session) -> list[Report]:
    return list(db.scalars(select(Report).order_by(Report.created_at.desc(), Report.id.desc())))


def list_reports_page(db: Session, limit: int | None = 50, offset: int = 0) -> Page[Report]:
    stmt = select(Report).order_by(Report.created_at.desc(), Report.id.desc())
    return page_from_statement(db, stmt, limit=limit, offset=offset)


def get_report(db: Session, report_id: int) -> Report | None:
    return db.get(Report, report_id)


def create_report(db: Session, payload: ReportCreate) -> Report:
    item = Report(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_report(db: Session, item: Report, payload: ReportUpdate) -> Report:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_report(db: Session, item: Report) -> None:
    db.delete(item)
    db.commit()


def resolve_report_path(item: Report) -> Path:
    return Path("var") / item.file_path
