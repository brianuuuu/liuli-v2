from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.disclosure_library.schemas import (
    CompanyDisclosureCreate,
    CompanyDisclosureUpdate,
)


def list_disclosures(db: Session) -> list[CompanyDisclosure]:
    return list(
        db.scalars(
            select(CompanyDisclosure).order_by(
                CompanyDisclosure.publish_time.desc().nullslast(),
                CompanyDisclosure.id.desc(),
            )
        )
    )


def get_disclosure(db: Session, disclosure_id: int) -> CompanyDisclosure | None:
    return db.get(CompanyDisclosure, disclosure_id)


def find_duplicate(db: Session, payload: CompanyDisclosureCreate) -> CompanyDisclosure | None:
    if payload.source_url:
        return db.scalar(
            select(CompanyDisclosure).where(
                CompanyDisclosure.source == payload.source,
                CompanyDisclosure.source_url == payload.source_url,
            )
        )
    return db.scalar(
        select(CompanyDisclosure).where(
            and_(
                CompanyDisclosure.source == payload.source,
                CompanyDisclosure.title == payload.title,
                CompanyDisclosure.publish_time == payload.publish_time,
            )
        )
    )


def upsert_disclosure(db: Session, payload: CompanyDisclosureCreate) -> CompanyDisclosure:
    existing = find_duplicate(db, payload)
    if existing is None:
        item = CompanyDisclosure(**payload.model_dump())
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    for key, value in payload.model_dump().items():
        setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing


def update_disclosure(db: Session, item: CompanyDisclosure, payload: CompanyDisclosureUpdate) -> CompanyDisclosure:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def mark_file_path(db: Session, item: CompanyDisclosure, file_path: str) -> CompanyDisclosure:
    item.file_path = file_path
    if item.parse_status in {"pending", "download_failed"}:
        item.parse_status = "downloaded"
    db.commit()
    db.refresh(item)
    return item


def mark_parse_success(
    db: Session,
    item: CompanyDisclosure,
    parsed_text_path: str,
    parsed_markdown_path: str,
) -> CompanyDisclosure:
    item.parsed_text_path = parsed_text_path
    item.parsed_markdown_path = parsed_markdown_path
    item.parse_status = "parsed"
    db.commit()
    db.refresh(item)
    return item


def mark_parse_failed(db: Session, item: CompanyDisclosure) -> CompanyDisclosure:
    item.parse_status = "parse_failed"
    db.commit()
    db.refresh(item)
    return item
