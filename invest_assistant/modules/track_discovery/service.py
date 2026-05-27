from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.market_radar.models import SourceTag, Tag, TagHeatSnapshot, TrackTagRelation
from invest_assistant.modules.market_radar.schemas import TagBindingCreate
from invest_assistant.modules.market_radar.service import bind_track_tag, list_track_tag_bindings
from invest_assistant.modules.stock_analysis.models import StockCompareGroup, StockResearchNote, StockScoreSnapshot, StockTrackRelation
from invest_assistant.modules.track_discovery.models import (
    Track,
    TrackAnalysisSnapshot,
    TrackMaterial,
    TrackStatusHistory,
)
from invest_assistant.modules.track_discovery.schemas import (
    TrackAnalysisSnapshotCreate,
    TrackCreate,
    TrackMaterialCreate,
    TrackMaterialUpdate,
    TrackStatusChange,
    TrackUpdate,
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
    db.commit()
    db.refresh(track)
    bind_track_tag(db, track.id, TagBindingCreate(name=track.name, source="system", status="active"))
    return _track_dict(db, track)


def list_tracks(db: Session, status: str | None = None) -> list[dict]:
    stmt = select(Track).order_by(Track.updated_at.desc(), Track.id.desc())
    if status:
        stmt = stmt.where(Track.status == status)
    tracks = list(db.scalars(stmt))
    return [_track_dict(db, track) for track in tracks]


def get_track(db: Session, track_id: int) -> dict | None:
    track = db.get(Track, track_id)
    if track is None:
        return None
    return _track_dict(db, track)


def update_track(db: Session, track_id: int, payload: TrackUpdate) -> dict | None:
    track = db.get(Track, track_id)
    if track is None:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(track, key, value)
    db.commit()
    db.refresh(track)
    bind_track_tag(db, track.id, TagBindingCreate(name=track.name, source="system", status="active"))
    return _track_dict(db, track)


def delete_candidate_track(db: Session, track_id: int) -> bool:
    track = db.get(Track, track_id)
    if track is None:
        return False
    if track.status != "candidate":
        raise ValueError("only candidate tracks can be deleted")

    tag_ids = [tag_id for tag_id in db.scalars(select(TrackTagRelation.tag_id).where(TrackTagRelation.track_id == track_id))]
    if tag_ids:
        db.execute(delete(SourceTag).where(SourceTag.tag_id.in_(tag_ids)))
        db.execute(delete(TagHeatSnapshot).where(TagHeatSnapshot.tag_id.in_(tag_ids)))
        db.execute(delete(TrackTagRelation).where(TrackTagRelation.track_id == track_id))
        db.execute(delete(Tag).where(Tag.id.in_(tag_ids)))

    db.execute(delete(StockTrackRelation).where(StockTrackRelation.track_id == track_id))
    db.execute(update(StockResearchNote).where(StockResearchNote.related_track_id == track_id).values(related_track_id=None))
    db.execute(update(StockScoreSnapshot).where(StockScoreSnapshot.track_id == track_id).values(track_id=None))
    db.execute(update(StockCompareGroup).where(StockCompareGroup.track_id == track_id).values(track_id=None))
    db.execute(delete(TrackStatusHistory).where(TrackStatusHistory.track_id == track_id))
    db.execute(delete(TrackMaterial).where(TrackMaterial.track_id == track_id))
    db.execute(delete(TrackAnalysisSnapshot).where(TrackAnalysisSnapshot.track_id == track_id))
    db.delete(track)
    db.commit()
    return True


def create_material(db: Session, track_id: int, payload: TrackMaterialCreate) -> TrackMaterial:
    item = TrackMaterial(track_id=track_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_materials(db: Session, track_id: int) -> list[TrackMaterial]:
    stmt = (
        select(TrackMaterial)
        .where(TrackMaterial.track_id == track_id)
        .order_by(TrackMaterial.updated_at.desc(), TrackMaterial.id.desc())
    )
    return list(db.scalars(stmt))


def update_material(db: Session, material_id: int, payload: TrackMaterialUpdate) -> TrackMaterial | None:
    item = db.get(TrackMaterial, material_id)
    if item is None:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def create_analysis_snapshot(db: Session, track_id: int, payload: TrackAnalysisSnapshotCreate) -> TrackAnalysisSnapshot:
    item = TrackAnalysisSnapshot(track_id=track_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_analysis_snapshots(db: Session, track_id: int | None = None) -> list[TrackAnalysisSnapshot]:
    stmt = select(TrackAnalysisSnapshot).order_by(TrackAnalysisSnapshot.analysis_date.desc(), TrackAnalysisSnapshot.id.desc())
    if track_id is not None:
        stmt = stmt.where(TrackAnalysisSnapshot.track_id == track_id)
    return list(db.scalars(stmt))


def change_track_status(db: Session, track_id: int, payload: TrackStatusChange) -> dict | None:
    track = db.get(Track, track_id)
    if track is None:
        return None
    old_status = track.status
    old_stage = track.stage
    track.status = payload.new_status
    if payload.new_stage is not None:
        track.stage = payload.new_stage
    db.add(
        TrackStatusHistory(
            track_id=track.id,
            old_status=old_status,
            new_status=payload.new_status,
            old_stage=old_stage,
            new_stage=track.stage,
            reason=payload.reason,
            changed_by=payload.changed_by,
        )
    )
    db.commit()
    db.refresh(track)
    bind_track_tag(db, track.id, TagBindingCreate(name=track.name, source="system", status="active"))
    return _track_dict(db, track)


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


def collect_materials_job(db: Session) -> JobResult:
    return JobResult(success=True, message="track materials are curated manually")


def refresh_bound_stocks_job(db: Session) -> JobResult:
    return JobResult(success=True, message="stock-track relations are curated manually")


def _tag_dict(tag: Tag) -> dict:
    return {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "source": tag.source,
        "status": tag.status,
    }


def _track_dict(db: Session, track: Track) -> dict:
    bindings = list_track_tag_bindings(db, track.id)
    return {
        "id": track.id,
        "name": track.name,
        "description": track.description,
        "status": track.status,
        "track_score": track.track_score,
        "current_view": track.current_view,
        "stage": track.stage,
        "confidence_level": track.confidence_level,
        "created_at": track.created_at,
        "updated_at": track.updated_at,
        "tag": bindings[0]["tag"] if bindings else None,
    }


def _heat_dict(snapshot: TagHeatSnapshot) -> dict:
    return {
        "window_type": snapshot.window_type,
        "trigger_count": snapshot.trigger_count,
        "source_count": snapshot.source_count,
        "heat_score": snapshot.heat_score,
        "rank_no": snapshot.rank_no,
    }
