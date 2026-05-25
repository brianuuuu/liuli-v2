from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.market_radar.backfill_requests import enqueue_tag_backfill
from invest_assistant.modules.market_radar.models import SourceTag, Tag, TagCandidate, TagHeatSnapshot
from invest_assistant.modules.stock_analysis.models import StockCompareGroup, StockResearchNote, StockScoreSnapshot, StockTrackRelation
from invest_assistant.modules.track_discovery.models import (
    Track,
    TrackAlias,
    TrackEvidence,
    TrackRelatedStock,
    TrackStatusHistory,
    TrackThesis,
    TrackValidationIndicator,
)
from invest_assistant.modules.track_discovery.schemas import (
    TrackAliasCreate,
    TrackCreate,
    TrackEvidenceCreate,
    TrackRelatedStockCreate,
    TrackStatusChange,
    TrackThesisCreate,
    TrackThesisUpdate,
    TrackUpdate,
    TrackValidationIndicatorCreate,
)


def create_track(db: Session, payload: TrackCreate) -> dict:
    existing = db.scalar(select(Track).where(Track.name == payload.name))
    if existing is None:
        track = Track(**payload.model_dump())
        db.add(track)
        db.flush()
    else:
        track = existing
        for key, value in payload.model_dump().items():
            setattr(track, key, value)
    tag = _sync_track_tag(db, track)
    db.commit()
    db.refresh(track)
    db.refresh(tag)
    enqueue_tag_backfill(db, tag)
    db.commit()
    return _track_dict(track, tag)


def list_tracks(db: Session, status: str | None = None) -> list[dict]:
    stmt = select(Track).order_by(Track.updated_at.desc(), Track.id.desc())
    if status:
        stmt = stmt.where(Track.status == status)
    tracks = list(db.scalars(stmt))
    tags = _tags_by_track_id(db, [track.id for track in tracks])
    return [_track_dict(track, tags.get(track.id)) for track in tracks]


def get_track(db: Session, track_id: int) -> dict | None:
    track = db.get(Track, track_id)
    if track is None:
        return None
    tag = db.scalar(select(Tag).where(Tag.type == "track", Tag.track_id == track.id))
    return _track_dict(track, tag)


def update_track(db: Session, track_id: int, payload: TrackUpdate) -> dict | None:
    track = db.get(Track, track_id)
    if track is None:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(track, key, value)
    tag = _sync_track_tag(db, track)
    db.commit()
    db.refresh(track)
    db.refresh(tag)
    enqueue_tag_backfill(db, tag)
    db.commit()
    return _track_dict(track, tag)


def delete_candidate_track(db: Session, track_id: int) -> bool:
    track = db.get(Track, track_id)
    if track is None:
        return False
    if track.status != "candidate":
        raise ValueError("only candidate tracks can be deleted")

    tag_ids = [
        tag_id
        for tag_id in db.scalars(select(Tag.id).where(Tag.type == "track", Tag.track_id == track_id))
        if tag_id is not None
    ]
    if tag_ids:
        db.execute(delete(SourceTag).where(SourceTag.tag_id.in_(tag_ids)))
        db.execute(delete(TagHeatSnapshot).where(TagHeatSnapshot.tag_id.in_(tag_ids)))
        db.execute(update(TagCandidate).where(TagCandidate.target_tag_id.in_(tag_ids)).values(target_tag_id=None))
        db.execute(delete(Tag).where(Tag.id.in_(tag_ids)))

    db.execute(delete(StockTrackRelation).where(StockTrackRelation.track_id == track_id))
    db.execute(update(StockResearchNote).where(StockResearchNote.related_track_id == track_id).values(related_track_id=None))
    db.execute(update(StockScoreSnapshot).where(StockScoreSnapshot.track_id == track_id).values(track_id=None))
    db.execute(update(StockCompareGroup).where(StockCompareGroup.track_id == track_id).values(track_id=None))
    db.execute(delete(TrackStatusHistory).where(TrackStatusHistory.track_id == track_id))
    db.execute(delete(TrackValidationIndicator).where(TrackValidationIndicator.track_id == track_id))
    db.execute(delete(TrackEvidence).where(TrackEvidence.track_id == track_id))
    db.execute(delete(TrackRelatedStock).where(TrackRelatedStock.track_id == track_id))
    db.execute(delete(TrackAlias).where(TrackAlias.track_id == track_id))
    db.execute(delete(TrackThesis).where(TrackThesis.track_id == track_id))
    db.delete(track)
    db.commit()
    return True


def create_alias(db: Session, track_id: int, payload: TrackAliasCreate) -> TrackAlias:
    item = TrackAlias(track_id=track_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    tag = db.scalar(select(Tag).where(Tag.type == "track", Tag.track_id == track_id))
    if tag is not None:
        enqueue_tag_backfill(db, tag)
        db.commit()
    return item


def list_aliases(db: Session, track_id: int) -> list[TrackAlias]:
    return list(db.scalars(select(TrackAlias).where(TrackAlias.track_id == track_id).order_by(TrackAlias.alias.asc())))


def create_thesis(db: Session, track_id: int, payload: TrackThesisCreate, user_id: int | None) -> TrackThesis:
    item = TrackThesis(track_id=track_id, **payload.model_dump(), user_id=user_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_theses(db: Session, track_id: int | None = None) -> list[TrackThesis]:
    stmt = select(TrackThesis).order_by(TrackThesis.updated_at.desc(), TrackThesis.id.desc())
    if track_id is not None:
        stmt = stmt.where(TrackThesis.track_id == track_id)
    return list(db.scalars(stmt))


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


def add_indicator(db: Session, track_id: int, payload: TrackValidationIndicatorCreate, thesis_id: int | None = None) -> TrackValidationIndicator:
    item = TrackValidationIndicator(track_id=track_id, thesis_id=thesis_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_indicators(db: Session, track_id: int) -> list[TrackValidationIndicator]:
    return list(db.scalars(select(TrackValidationIndicator).where(TrackValidationIndicator.track_id == track_id)))


def add_evidence(db: Session, track_id: int, payload: TrackEvidenceCreate, thesis_id: int | None = None) -> TrackEvidence:
    item = TrackEvidence(track_id=track_id, thesis_id=thesis_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_evidence(db: Session, track_id: int) -> list[TrackEvidence]:
    return list(db.scalars(select(TrackEvidence).where(TrackEvidence.track_id == track_id).order_by(TrackEvidence.id.desc())))


def add_related_stock(db: Session, track_id: int, payload: TrackRelatedStockCreate, thesis_id: int | None = None) -> TrackRelatedStock:
    item = TrackRelatedStock(track_id=track_id, thesis_id=thesis_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_related_stocks(db: Session, track_id: int) -> list[TrackRelatedStock]:
    return list(db.scalars(select(TrackRelatedStock).where(TrackRelatedStock.track_id == track_id)))


def change_track_status(db: Session, track_id: int, payload: TrackStatusChange) -> dict | None:
    track = db.get(Track, track_id)
    if track is None:
        return None
    old_status = track.status
    track.status = payload.new_status
    db.add(
        TrackStatusHistory(
            track_id=track.id,
            old_status=old_status,
            new_status=payload.new_status,
            reason=payload.reason,
        )
    )
    tag = _sync_track_tag(db, track)
    db.commit()
    db.refresh(track)
    db.refresh(tag)
    return _track_dict(track, tag)


def change_status(db: Session, thesis: TrackThesis, payload: TrackStatusChange) -> TrackThesis:
    old_status = thesis.status
    thesis.status = payload.new_status
    db.add(
        TrackStatusHistory(
            track_id=thesis.track_id,
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
        "stock_id": tag.stock_id,
        "track_id": tag.track_id,
        "status": tag.status,
    }


def _track_dict(track: Track, tag: Tag | None) -> dict:
    return {
        "id": track.id,
        "name": track.name,
        "description": track.description,
        "status": track.status,
        "created_at": track.created_at,
        "updated_at": track.updated_at,
        "tag": _tag_dict(tag) if tag is not None else None,
    }


def _tags_by_track_id(db: Session, track_ids: list[int]) -> dict[int, Tag]:
    if not track_ids:
        return {}
    tags = db.scalars(select(Tag).where(Tag.type == "track", Tag.track_id.in_(track_ids)))
    return {tag.track_id: tag for tag in tags if tag.track_id is not None}


def _sync_track_tag(db: Session, track: Track) -> Tag:
    tag = db.scalar(select(Tag).where(Tag.name == track.name))
    if tag is None:
        tag = db.scalar(select(Tag).where(Tag.type == "track", Tag.track_id == track.id))
    if tag is None:
        tag = Tag(name=track.name, type="track", track_id=track.id, status=track.status)
        db.add(tag)
    else:
        tag.name = track.name
        tag.track_id = track.id
        tag.status = track.status
    return tag


def _heat_dict(snapshot: TagHeatSnapshot) -> dict:
    return {
        "window_type": snapshot.window_type,
        "trigger_count": snapshot.trigger_count,
        "source_count": snapshot.source_count,
        "heat_score": snapshot.heat_score,
        "rank_no": snapshot.rank_no,
    }
