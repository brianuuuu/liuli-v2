from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.disclosure_library.schemas import (
    CompanyDisclosureCreate,
    CompanyDisclosureUpdate,
)


def list_disclosures(db: Session) -> list[CompanyDisclosure]:
    return list(db.scalars(select(CompanyDisclosure).order_by(CompanyDisclosure.publish_time.desc())))


def get_disclosure(db: Session, disclosure_id: int) -> CompanyDisclosure | None:
    return db.get(CompanyDisclosure, disclosure_id)


def create_disclosure(db: Session, payload: CompanyDisclosureCreate) -> CompanyDisclosure:
    item = CompanyDisclosure(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_disclosure(db: Session, item: CompanyDisclosure, payload: CompanyDisclosureUpdate) -> CompanyDisclosure:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def resolve_path(path: str | None) -> Path | None:
    if not path:
        return None
    return Path("var") / path
