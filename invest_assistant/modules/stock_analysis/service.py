from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.service import ensure_stock_tag
from invest_assistant.modules.stock_analysis.models import (
    StockCompareGroup,
    StockPoolItem,
    StockResearchNote,
    StockScoreSnapshot,
    StockTrackRelation,
)
from invest_assistant.modules.track_discovery.models import Track
from invest_assistant.modules.stock_analysis.schemas import (
    StockCompareGroupCreate,
    StockPoolCreate,
    StockResearchNoteCreate,
    StockScoreSnapshotCreate,
    StockTrackRelationCreate,
    StockTrackRelationUpdate,
)


def create_pool_item(db: Session, payload: StockPoolCreate) -> StockPoolItem:
    existing = db.scalar(select(StockPoolItem).where(StockPoolItem.stock_id == payload.stock_id))
    if existing:
        existing.status = payload.status
        existing.source = payload.source
        existing.reason = payload.reason
        db.commit()
        db.refresh(existing)
        ensure_stock_tag(db, existing.stock_id)
        return existing
    item = StockPoolItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    ensure_stock_tag(db, item.stock_id)
    return item


def list_pool(db: Session) -> list[StockPoolItem]:
    return list(db.scalars(select(StockPoolItem).order_by(StockPoolItem.updated_at.desc())))


def list_candidates(db: Session) -> list[StockPoolItem]:
    return list(db.scalars(select(StockPoolItem).where(StockPoolItem.status == "candidate").order_by(StockPoolItem.updated_at.desc())))


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


def list_track_relations(db: Session, stock_id: int) -> list[dict]:
    rows = db.execute(
        select(StockTrackRelation, Track)
        .join(Track, Track.id == StockTrackRelation.track_id)
        .where(StockTrackRelation.stock_id == stock_id)
        .order_by(StockTrackRelation.updated_at.desc(), StockTrackRelation.id.desc())
    ).all()
    return [_relation_dict(relation, track) for relation, track in rows]


def list_stocks_for_track(db: Session, track_id: int) -> list[dict]:
    rows = db.execute(
        select(StockTrackRelation, Track)
        .join(Track, Track.id == StockTrackRelation.track_id)
        .where(StockTrackRelation.track_id == track_id)
        .order_by(StockTrackRelation.updated_at.desc(), StockTrackRelation.id.desc())
    ).all()
    return [_relation_dict(relation, track) for relation, track in rows]


def bind_track(db: Session, stock_id: int, payload: StockTrackRelationCreate) -> dict:
    track = db.get(Track, payload.track_id)
    if track is None:
        raise ValueError("track not found")
    relation = db.scalar(
        select(StockTrackRelation).where(
            StockTrackRelation.stock_id == stock_id,
            StockTrackRelation.track_id == payload.track_id,
        )
    )
    if relation is None:
        relation = StockTrackRelation(stock_id=stock_id, **payload.model_dump())
        db.add(relation)
    else:
        for key, value in payload.model_dump().items():
            setattr(relation, key, value)
    db.commit()
    db.refresh(relation)
    return _relation_dict(relation, track)


def update_track_relation(db: Session, relation_id: int, payload: StockTrackRelationUpdate) -> dict | None:
    relation = db.get(StockTrackRelation, relation_id)
    if relation is None:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(relation, key, value)
    db.commit()
    db.refresh(relation)
    track = db.get(Track, relation.track_id)
    return _relation_dict(relation, track)


def disable_track_relation(db: Session, relation_id: int) -> dict | None:
    relation = db.get(StockTrackRelation, relation_id)
    if relation is None:
        return None
    relation.status = "disabled"
    db.commit()
    db.refresh(relation)
    track = db.get(Track, relation.track_id)
    return _relation_dict(relation, track)


def _relation_dict(relation: StockTrackRelation, track: Track | None) -> dict:
    return {
        "id": relation.id,
        "stock_id": relation.stock_id,
        "track_id": relation.track_id,
        "relation_type": relation.relation_type,
        "conviction": relation.conviction,
        "reason": relation.reason,
        "status": relation.status,
        "created_at": relation.created_at,
        "updated_at": relation.updated_at,
        "track": _track_dict(track) if track is not None else None,
    }


def _track_dict(track: Track) -> dict:
    return {
        "id": track.id,
        "name": track.name,
        "description": track.description,
        "status": track.status,
    }
