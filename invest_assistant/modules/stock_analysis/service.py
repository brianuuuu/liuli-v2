from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.stock_analysis.models import (
    StockCompareGroup,
    StockPoolItem,
    StockResearchNote,
    StockScoreSnapshot,
)
from invest_assistant.modules.stock_analysis.schemas import (
    StockCompareGroupCreate,
    StockPoolCreate,
    StockResearchNoteCreate,
    StockScoreSnapshotCreate,
)


def create_pool_item(db: Session, payload: StockPoolCreate) -> StockPoolItem:
    existing = db.scalar(select(StockPoolItem).where(StockPoolItem.stock_id == payload.stock_id))
    if existing:
        existing.status = payload.status
        db.commit()
        db.refresh(existing)
        return existing
    item = StockPoolItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_pool(db: Session) -> list[StockPoolItem]:
    return list(db.scalars(select(StockPoolItem).order_by(StockPoolItem.updated_at.desc())))


def create_note(db: Session, stock_id: int, payload: StockResearchNoteCreate) -> StockResearchNote:
    item = StockResearchNote(stock_id=stock_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_notes(db: Session, stock_id: int) -> list[StockResearchNote]:
    return list(db.scalars(select(StockResearchNote).where(StockResearchNote.stock_id == stock_id).order_by(StockResearchNote.id.desc())))


def create_score(db: Session, stock_id: int, payload: StockScoreSnapshotCreate) -> StockScoreSnapshot:
    item = StockScoreSnapshot(stock_id=stock_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_scores(db: Session, stock_id: int) -> list[StockScoreSnapshot]:
    return list(db.scalars(select(StockScoreSnapshot).where(StockScoreSnapshot.stock_id == stock_id).order_by(StockScoreSnapshot.score_date.desc())))


def create_compare_group(db: Session, payload: StockCompareGroupCreate) -> StockCompareGroup:
    item = StockCompareGroup(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_compare_groups(db: Session) -> list[StockCompareGroup]:
    return list(db.scalars(select(StockCompareGroup).order_by(StockCompareGroup.id.desc())))
