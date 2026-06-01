from collections import defaultdict

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.knowledge_base.models import KnowledgeNote
from invest_assistant.modules.market_radar.models import SourceItem, SourceTag, Tag, TagHeatSnapshot, TrackTagRelation
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


def get_dashboard(db: Session) -> dict:
    tracks = list(db.scalars(select(Track).order_by(Track.updated_at.desc(), Track.id.desc())))
    track_ids = [track.id for track in tracks]
    if not track_ids:
        return {
            "summary": {
                "warming_tracks_count": 0,
                "focus_tracks_count": 0,
                "pending_materials_count": 0,
                "top_heat_track": None,
            },
            "heat_trends": [],
            "heat_rankings": [],
            "focus_tracks": [],
            "latest_materials": [],
            "default_track_id": None,
            "analysis_summary": None,
        }

    track_by_id = {track.id: track for track in tracks}
    tag_rows = db.execute(
        select(TrackTagRelation.track_id, TrackTagRelation.tag_id).where(
            TrackTagRelation.track_id.in_(track_ids),
            TrackTagRelation.status == "active",
        )
    ).all()
    tag_to_tracks: dict[int, list[int]] = defaultdict(list)
    for track_id, tag_id in tag_rows:
        tag_to_tracks[int(tag_id)].append(int(track_id))

    heat_by_track_window_time: dict[tuple[int, str, object], float] = defaultdict(float)
    change_by_track_window_time: dict[tuple[int, str, object], float] = defaultdict(float)
    latest_stat_by_window: dict[str, object] = {}
    if tag_to_tracks:
        heat_rows = list(db.scalars(select(TagHeatSnapshot).where(TagHeatSnapshot.tag_id.in_(tag_to_tracks.keys()))))
        for row in heat_rows:
            for track_id in tag_to_tracks.get(row.tag_id, []):
                heat_by_track_window_time[(track_id, row.window_type, row.stat_time)] += float(row.heat_score or 0)
                change_by_track_window_time[(track_id, row.window_type, row.stat_time)] += float(row.change_ratio or 0)
            if row.stat_time is not None and (row.window_type not in latest_stat_by_window or row.stat_time > latest_stat_by_window[row.window_type]):
                latest_stat_by_window[row.window_type] = row.stat_time

    def latest_heat(track_id: int, window: str) -> float:
        stat_time = latest_stat_by_window.get(window)
        if stat_time is None:
            return 0.0
        return round(heat_by_track_window_time.get((track_id, window, stat_time), 0.0), 2)

    def latest_change(track_id: int, window: str) -> float:
        stat_time = latest_stat_by_window.get(window)
        if stat_time is None:
            return 0.0
        change = change_by_track_window_time.get((track_id, window, stat_time), 0.0)
        if change:
            return round(change, 4)
        points = sorted(
            (stat_time, value)
            for (candidate_track_id, candidate_window, stat_time), value in heat_by_track_window_time.items()
            if candidate_track_id == track_id and candidate_window == window
        )
        if len(points) < 2 or points[-2][1] == 0:
            return 0.0
        return round((points[-1][1] - points[-2][1]) / points[-2][1], 4)

    material_counts = dict(
        db.execute(
            select(TrackMaterial.track_id, func.count(TrackMaterial.id))
            .where(TrackMaterial.track_id.in_(track_ids))
            .group_by(TrackMaterial.track_id)
        ).all()
    )
    stock_counts = dict(
        db.execute(
            select(StockTrackRelation.track_id, func.count(StockTrackRelation.id))
            .where(StockTrackRelation.track_id.in_(track_ids), StockTrackRelation.status == "active")
            .group_by(StockTrackRelation.track_id)
        ).all()
    )
    pending_materials_count = int(
        db.scalar(select(func.count(TrackMaterial.id)).where(TrackMaterial.track_id.in_(track_ids), TrackMaterial.status == "pending")) or 0
    )

    rankings = []
    for track in tracks:
        rankings.append(
            {
                "track_id": track.id,
                "track_name": track.name,
                "current_heat": latest_heat(track.id, "24h"),
                "change_7d": latest_change(track.id, "7d"),
                "change_30d": latest_change(track.id, "30d"),
                "change_90d": latest_change(track.id, "90d"),
                "stage": track.stage,
                "track_score": track.track_score,
            }
        )
    rankings.sort(key=lambda item: (-float(item["current_heat"] or 0), -float(item["track_score"] or 0), item["track_id"]))
    for index, item in enumerate(rankings, start=1):
        item["rank"] = index

    focus_tracks = sorted(
        [
            {
                "track_id": track.id,
                "name": track.name,
                "track_score": track.track_score,
                "current_view": track.current_view,
                "stage": track.stage,
                "confidence_level": track.confidence_level,
                "bound_stock_count": int(stock_counts.get(track.id, 0)),
                "recent_material_count": int(material_counts.get(track.id, 0)),
                "current_heat": latest_heat(track.id, "24h"),
            }
            for track in tracks
        ],
        key=lambda item: (0 if track_by_id[item["track_id"]].status == "active" else 1, -float(item["track_score"] or 0), -float(item["current_heat"] or 0)),
    )[:6]

    trend_track_ids = [item["track_id"] for item in rankings[:10]]
    heat_trends = []
    for track_id in trend_track_ids:
        points = [
            {"window_type": window, "stat_time": _isoformat(stat_time), "heat_score": round(value, 2)}
            for (candidate_track_id, window, stat_time), value in heat_by_track_window_time.items()
            if candidate_track_id == track_id and window in {"7d", "30d", "90d"}
        ]
        points.sort(key=lambda item: (item["window_type"], item["stat_time"] or ""))
        heat_trends.append({"track_id": track_id, "track_name": track_by_id[track_id].name, "points": points})

    latest_materials = []
    material_rows = sorted(
        db.scalars(select(TrackMaterial).where(TrackMaterial.track_id.in_(track_ids))),
        key=lambda item: (
            0 if item.status == "pending" else 1,
            -(item.updated_at.timestamp() if item.updated_at else 0),
            -item.id,
        ),
    )
    for item in material_rows[:10]:
        row = _material_dict(db, item)
        row["track_name"] = track_by_id.get(item.track_id).name if track_by_id.get(item.track_id) else f"#{item.track_id}"
        latest_materials.append(row)

    default_track_id = rankings[0]["track_id"] if rankings else tracks[0].id
    analysis_summary = _latest_analysis_summary(db, track_by_id.get(default_track_id))
    top_heat = rankings[0] if rankings else None
    return {
        "summary": {
            "warming_tracks_count": len([item for item in rankings if any(float(item[f"change_{window}"] or 0) > 0 for window in ("7d", "30d", "90d"))]),
            "focus_tracks_count": len([track for track in tracks if track.status == "active"]),
            "pending_materials_count": pending_materials_count,
            "top_heat_track": {
                "track_id": top_heat["track_id"],
                "name": top_heat["track_name"],
                "heat_score": top_heat["current_heat"],
            }
            if top_heat
            else None,
        },
        "heat_trends": heat_trends,
        "heat_rankings": rankings,
        "focus_tracks": focus_tracks,
        "latest_materials": latest_materials,
        "default_track_id": default_track_id,
        "analysis_summary": analysis_summary,
    }


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


def list_materials(db: Session, track_id: int) -> list[dict]:
    stmt = (
        select(TrackMaterial)
        .where(TrackMaterial.track_id == track_id)
        .order_by(TrackMaterial.updated_at.desc(), TrackMaterial.id.desc())
    )
    return [_material_dict(db, item) for item in db.scalars(stmt)]


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


def _latest_analysis_summary(db: Session, track: Track | None) -> dict | None:
    if track is None:
        return None
    snapshot = db.scalar(
        select(TrackAnalysisSnapshot)
        .where(TrackAnalysisSnapshot.track_id == track.id)
        .order_by(TrackAnalysisSnapshot.analysis_date.desc(), TrackAnalysisSnapshot.id.desc())
    )
    if snapshot is None:
        return {
            "track_id": track.id,
            "track_name": track.name,
            "analysis_date": None,
            "market_space": None,
            "market_size": None,
            "growth_rate": None,
            "heat_summary": None,
            "opportunity_points": None,
            "risk_points": None,
            "watch_signals": None,
            "score": track.track_score,
            "confidence_level": track.confidence_level,
        }
    return {
        "track_id": track.id,
        "track_name": track.name,
        "analysis_date": snapshot.analysis_date.isoformat() if snapshot.analysis_date else None,
        "market_space": snapshot.market_space,
        "market_size": snapshot.market_size,
        "growth_rate": snapshot.growth_rate,
        "heat_summary": snapshot.heat_summary,
        "opportunity_points": snapshot.opportunity_points,
        "risk_points": snapshot.risk_points,
        "watch_signals": snapshot.watch_signals,
        "score": snapshot.score,
        "confidence_level": snapshot.confidence_level,
    }


def _isoformat(value: object) -> str | None:
    if value is None:
        return None
    formatter = getattr(value, "isoformat", None)
    return formatter() if callable(formatter) else str(value)


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


def _material_dict(db: Session, item: TrackMaterial) -> dict:
    material = {
        "id": item.id,
        "track_id": item.track_id,
        "material_type": item.material_type,
        "material_id": item.material_id,
        "direction": item.direction,
        "importance_level": item.importance_level,
        "status": item.status,
        "note": item.note,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "material_title": None,
        "material_summary": None,
        "material_source_name": None,
        "material_url": None,
        "material_time": None,
    }
    if item.material_type == "source_item":
        source = db.get(SourceItem, item.material_id)
        if source is not None:
            material.update(
                material_title=source.title,
                material_summary=_summary(source.content),
                material_source_name=source.source_name,
                material_url=source.source_url,
                material_time=source.publish_time or source.created_at,
            )
    elif item.material_type == "knowledge_note":
        note = db.get(KnowledgeNote, item.material_id)
        if note is not None:
            material.update(
                material_title=note.title,
                material_summary=_summary(note.content),
                material_source_name="knowledge_note",
                material_time=note.updated_at or note.created_at,
            )
    return material


def _summary(value: str | None, limit: int = 120) -> str | None:
    text = " ".join(str(value or "").split())
    if not text:
        return None
    return text if len(text) <= limit else f"{text[:limit]}..."
