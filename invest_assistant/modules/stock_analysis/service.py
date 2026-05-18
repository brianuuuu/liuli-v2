from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.stock_analysis.models import (
    StockCompareGroup,
    StockPoolItem,
    StockResearchNote,
    StockScoreSnapshot,
    StockTrackTagBinding,
)
from invest_assistant.modules.market_radar.models import Tag
from invest_assistant.modules.stock_analysis.schemas import (
    StockCompareGroupCreate,
    StockPoolCreate,
    StockResearchNoteCreate,
    StockScoreSnapshotCreate,
    StockTrackTagBindingCreate,
    StockTrackTagBindingUpdate,
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


def list_track_tag_bindings(db: Session, stock_id: int) -> list[dict]:
    rows = db.execute(
        select(StockTrackTagBinding, Tag)
        .join(Tag, Tag.id == StockTrackTagBinding.track_tag_id)
        .where(StockTrackTagBinding.stock_id == stock_id)
        .order_by(StockTrackTagBinding.updated_at.desc(), StockTrackTagBinding.id.desc())
    ).all()
    return [_binding_dict(binding, tag) for binding, tag in rows]


def list_stocks_for_track_tag(db: Session, track_tag_id: int) -> list[dict]:
    rows = db.execute(
        select(StockTrackTagBinding, Tag)
        .join(Tag, Tag.id == StockTrackTagBinding.track_tag_id)
        .where(StockTrackTagBinding.track_tag_id == track_tag_id)
        .order_by(StockTrackTagBinding.updated_at.desc(), StockTrackTagBinding.id.desc())
    ).all()
    return [_binding_dict(binding, tag) for binding, tag in rows]


def bind_track_tag(db: Session, stock_id: int, payload: StockTrackTagBindingCreate) -> dict:
    tag = db.get(Tag, payload.track_tag_id)
    if tag is None or tag.type != "track":
        raise ValueError("track tag not found")
    binding = db.scalar(
        select(StockTrackTagBinding).where(
            StockTrackTagBinding.stock_id == stock_id,
            StockTrackTagBinding.track_tag_id == payload.track_tag_id,
        )
    )
    if binding is None:
        binding = StockTrackTagBinding(stock_id=stock_id, **payload.model_dump())
        db.add(binding)
    else:
        for key, value in payload.model_dump().items():
            setattr(binding, key, value)
    db.commit()
    db.refresh(binding)
    return _binding_dict(binding, tag)


def update_track_tag_binding(db: Session, binding_id: int, payload: StockTrackTagBindingUpdate) -> dict | None:
    binding = db.get(StockTrackTagBinding, binding_id)
    if binding is None:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(binding, key, value)
    db.commit()
    db.refresh(binding)
    tag = db.get(Tag, binding.track_tag_id)
    return _binding_dict(binding, tag)


def disable_track_tag_binding(db: Session, binding_id: int) -> dict | None:
    binding = db.get(StockTrackTagBinding, binding_id)
    if binding is None:
        return None
    binding.status = "disabled"
    db.commit()
    db.refresh(binding)
    tag = db.get(Tag, binding.track_tag_id)
    return _binding_dict(binding, tag)


def _binding_dict(binding: StockTrackTagBinding, tag: Tag | None) -> dict:
    return {
        "id": binding.id,
        "stock_id": binding.stock_id,
        "track_tag_id": binding.track_tag_id,
        "relation_type": binding.relation_type,
        "conviction": binding.conviction,
        "reason": binding.reason,
        "status": binding.status,
        "created_at": binding.created_at,
        "updated_at": binding.updated_at,
        "track_tag": _tag_dict(tag) if tag is not None else None,
    }


def _tag_dict(tag: Tag) -> dict:
    return {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "category": tag.category,
        "stock_id": tag.stock_id,
        "status": tag.status,
    }
