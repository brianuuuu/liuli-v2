from sqlalchemy import func, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.market_radar.models import Tag, TagHeatSnapshot
from invest_assistant.modules.track_discovery.models import (
    TrackEvidence,
    TrackRelatedStock,
    TrackStatusHistory,
    TrackThesis,
    TrackValidationIndicator,
)
from invest_assistant.modules.track_discovery.schemas import (
    TrackEvidenceCreate,
    TrackRelatedStockCreate,
    TrackStatusChange,
    TrackThesisCreate,
    TrackThesisUpdate,
    TrackValidationIndicatorCreate,
)


def create_thesis(db: Session, payload: TrackThesisCreate, user_id: int | None) -> TrackThesis:
    item = TrackThesis(**payload.model_dump(), user_id=user_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_theses(db: Session) -> list[TrackThesis]:
    return list(db.scalars(select(TrackThesis).order_by(TrackThesis.updated_at.desc(), TrackThesis.id.desc())))


def get_thesis(db: Session, thesis_id: int) -> TrackThesis | None:
    return db.get(TrackThesis, thesis_id)


def update_thesis(db: Session, item: TrackThesis, payload: TrackThesisUpdate) -> TrackThesis:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def archive_thesis(db: Session, item: TrackThesis) -> TrackThesis:
    item.status = "archived"
    db.commit()
    db.refresh(item)
    return item


def add_indicator(db: Session, thesis_id: int, payload: TrackValidationIndicatorCreate) -> TrackValidationIndicator:
    item = TrackValidationIndicator(thesis_id=thesis_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_indicators(db: Session, thesis_id: int) -> list[TrackValidationIndicator]:
    return list(db.scalars(select(TrackValidationIndicator).where(TrackValidationIndicator.thesis_id == thesis_id)))


def add_evidence(db: Session, thesis_id: int, payload: TrackEvidenceCreate) -> TrackEvidence:
    item = TrackEvidence(thesis_id=thesis_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_evidence(db: Session, thesis_id: int) -> list[TrackEvidence]:
    return list(db.scalars(select(TrackEvidence).where(TrackEvidence.thesis_id == thesis_id).order_by(TrackEvidence.id.desc())))


def add_related_stock(db: Session, thesis_id: int, payload: TrackRelatedStockCreate) -> TrackRelatedStock:
    item = TrackRelatedStock(thesis_id=thesis_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_related_stocks(db: Session, thesis_id: int) -> list[TrackRelatedStock]:
    return list(db.scalars(select(TrackRelatedStock).where(TrackRelatedStock.thesis_id == thesis_id)))


def change_status(db: Session, thesis: TrackThesis, payload: TrackStatusChange) -> TrackThesis:
    old_status = thesis.status
    thesis.status = payload.new_status
    db.add(
        TrackStatusHistory(
            thesis_id=thesis.id,
            old_status=old_status,
            new_status=payload.new_status,
            reason=payload.reason,
        )
    )
    db.commit()
    db.refresh(thesis)
    return thesis


def list_status_history(db: Session, thesis_id: int) -> list[TrackStatusHistory]:
    return list(db.scalars(select(TrackStatusHistory).where(TrackStatusHistory.thesis_id == thesis_id)))


def market_radar_candidates(db: Session, window: str = "24h") -> list[dict]:
    latest_stat = db.scalar(select(func.max(TagHeatSnapshot.stat_time)).where(TagHeatSnapshot.window_type == window))
    if latest_stat is None:
        return []
    rows = db.execute(
        select(TagHeatSnapshot, Tag)
        .join(Tag, Tag.id == TagHeatSnapshot.tag_id)
        .where(TagHeatSnapshot.window_type == window, TagHeatSnapshot.stat_time == latest_stat, Tag.type == "track")
        .order_by(TagHeatSnapshot.rank_no.asc())
    ).all()
    return [{"tag": _tag_dict(tag), "heat": _heat_dict(snapshot)} for snapshot, tag in rows]


def generate_candidates_job(db: Session) -> JobResult:
    candidates = market_radar_candidates(db)
    return JobResult(success=True, message=f"generated {len(candidates)} track candidates", processed_count=len(candidates))


def collect_evidence_job(db: Session) -> JobResult:
    return JobResult(success=True, message="evidence collection is manual in phase 4")


def refresh_related_stocks_job(db: Session) -> JobResult:
    return JobResult(success=True, message="related stock refresh is manual in phase 4")


def _tag_dict(tag: Tag) -> dict:
    return {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "category": tag.category,
        "stock_id": tag.stock_id,
        "status": tag.status,
    }


def _heat_dict(snapshot: TagHeatSnapshot) -> dict:
    return {
        "window_type": snapshot.window_type,
        "trigger_count": snapshot.trigger_count,
        "source_count": snapshot.source_count,
        "heat_score": snapshot.heat_score,
        "rank_no": snapshot.rank_no,
    }
