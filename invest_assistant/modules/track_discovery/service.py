from collections import defaultdict

from sqlalchemy import and_, case, delete, func, or_, select, update
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import Stock
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
from invest_assistant.shared.pagination import Page, make_page, normalize_limit, normalize_offset

DASHBOARD_HEAT_WINDOWS = ("24h", "7d", "30d", "90d")
DASHBOARD_TREND_WINDOWS = ("7d", "30d", "90d")
DASHBOARD_TREND_POINT_LIMIT = 30
DASHBOARD_RANKING_LIMIT = 10


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
    tag_ids = list({int(tag_id) for _track_id, tag_id in tag_rows})
    latest_stat_by_window = _dashboard_latest_stat_by_window(db, tag_ids)
    latest_heat_by_track_window = _dashboard_latest_heat_by_track_window(db, track_ids, latest_stat_by_window)

    def latest_heat(track_id: int, window: str) -> float:
        return round(float(latest_heat_by_track_window.get((track_id, window), {}).get("heat_score") or 0), 2)

    def latest_change(track_id: int, window: str) -> float:
        return round(float(latest_heat_by_track_window.get((track_id, window), {}).get("change_ratio") or 0), 4)

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
    heat_trends = _dashboard_heat_trends(db, track_by_id, trend_track_ids)

    latest_materials = []
    material_rows = list(
        db.scalars(
            select(TrackMaterial)
            .where(TrackMaterial.track_id.in_(track_ids))
            .order_by(
                case((TrackMaterial.status == "pending", 0), else_=1),
                TrackMaterial.updated_at.desc(),
                TrackMaterial.id.desc(),
            )
            .limit(10)
        )
    )
    for item in material_rows:
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


def _dashboard_latest_stat_by_window(db: Session, tag_ids: list[int]) -> dict[str, object]:
    if not tag_ids:
        return {}
    rows = db.execute(
        select(TagHeatSnapshot.window_type, func.max(TagHeatSnapshot.stat_time))
        .where(
            TagHeatSnapshot.tag_id.in_(tag_ids),
            TagHeatSnapshot.window_type.in_(DASHBOARD_HEAT_WINDOWS),
        )
        .group_by(TagHeatSnapshot.window_type)
    ).all()
    return {str(window): stat_time for window, stat_time in rows if stat_time is not None}


def _dashboard_latest_heat_by_track_window(
    db: Session,
    track_ids: list[int],
    latest_stat_by_window: dict[str, object],
) -> dict[tuple[int, str], dict[str, float]]:
    if not track_ids or not latest_stat_by_window:
        return {}
    latest_conditions = [
        and_(TagHeatSnapshot.window_type == window, TagHeatSnapshot.stat_time == stat_time)
        for window, stat_time in latest_stat_by_window.items()
    ]
    rows = db.execute(
        select(
            TrackTagRelation.track_id,
            TagHeatSnapshot.window_type,
            func.sum(TagHeatSnapshot.heat_score).label("heat_score"),
            func.sum(TagHeatSnapshot.change_ratio).label("change_ratio"),
        )
        .select_from(TrackTagRelation)
        .join(TagHeatSnapshot, TagHeatSnapshot.tag_id == TrackTagRelation.tag_id)
        .where(
            TrackTagRelation.status == "active",
            TrackTagRelation.track_id.in_(track_ids),
            or_(*latest_conditions),
        )
        .group_by(TrackTagRelation.track_id, TagHeatSnapshot.window_type)
    ).all()
    return {
        (int(track_id), str(window)): {
            "heat_score": float(heat_score or 0),
            "change_ratio": float(change_ratio or 0),
        }
        for track_id, window, heat_score, change_ratio in rows
    }


def _dashboard_heat_trends(
    db: Session,
    track_by_id: dict[int, Track],
    trend_track_ids: list[int],
) -> list[dict]:
    if not trend_track_ids:
        return []
    grouped_points = (
        select(
            TrackTagRelation.track_id.label("track_id"),
            TagHeatSnapshot.window_type.label("window_type"),
            TagHeatSnapshot.stat_time.label("stat_time"),
            func.sum(TagHeatSnapshot.heat_score).label("heat_score"),
        )
        .select_from(TrackTagRelation)
        .join(TagHeatSnapshot, TagHeatSnapshot.tag_id == TrackTagRelation.tag_id)
        .where(
            TrackTagRelation.status == "active",
            TrackTagRelation.track_id.in_(trend_track_ids),
            TagHeatSnapshot.window_type.in_(DASHBOARD_TREND_WINDOWS),
        )
        .group_by(TrackTagRelation.track_id, TagHeatSnapshot.window_type, TagHeatSnapshot.stat_time)
        .subquery()
    )
    ranked_points = (
        select(
            grouped_points.c.track_id,
            grouped_points.c.window_type,
            grouped_points.c.stat_time,
            grouped_points.c.heat_score,
            func.row_number()
            .over(
                partition_by=(grouped_points.c.track_id, grouped_points.c.window_type),
                order_by=grouped_points.c.stat_time.desc(),
            )
            .label("rn"),
        )
        .subquery()
    )
    rows = db.execute(
        select(
            ranked_points.c.track_id,
            ranked_points.c.window_type,
            ranked_points.c.stat_time,
            ranked_points.c.heat_score,
        )
        .where(ranked_points.c.rn <= DASHBOARD_TREND_POINT_LIMIT)
        .order_by(ranked_points.c.track_id.asc(), ranked_points.c.window_type.asc(), ranked_points.c.stat_time.asc())
    ).all()
    points_by_track: dict[int, list[dict]] = defaultdict(list)
    for track_id, window, stat_time, heat_score in rows:
        points_by_track[int(track_id)].append(
            {
                "window_type": str(window),
                "stat_time": _isoformat(stat_time),
                "heat_score": round(float(heat_score or 0), 2),
            }
        )
    return [
        {
            "track_id": track_id,
            "track_name": track_by_id[track_id].name,
            "points": points_by_track.get(track_id, []),
        }
        for track_id in trend_track_ids[:DASHBOARD_RANKING_LIMIT]
    ]


def get_track(db: Session, track_id: int) -> dict | None:
    track = db.get(Track, track_id)
    if track is None:
        return None
    return _track_dict(db, track)


def get_track_detail(db: Session, track_id: int) -> dict | None:
    track = db.get(Track, track_id)
    if track is None:
        return None

    tags = [item for item in list_track_tag_bindings(db, track.id) if item.get("status") == "active"]
    materials = list_materials(db, track.id)
    snapshots = [_analysis_snapshot_dict(item) for item in list_analysis_snapshots(db, track.id)]
    stocks = _track_detail_stocks(db, track.id)
    heat_trends = _track_detail_heat_trends(db, [int(item["tag"]["id"]) for item in tags if item.get("tag")])
    active_stock_count = len([item for item in stocks if item["status"] == "active"])
    latest_heat_score = _latest_heat_score(heat_trends)
    last_updated_candidates = [
        track.updated_at,
        *(item.get("updated_at") for item in materials),
        *(item.get("created_at") for item in snapshots),
        *(item.get("updated_at") for item in stocks),
        *(item.get("updated_at") for item in tags),
    ]

    return {
        "track": _track_dict(db, track),
        "summary": {
            "tag_count": len(tags),
            "material_count": len(materials),
            "pending_material_count": len([item for item in materials if item["status"] == "pending"]),
            "high_importance_material_count": len([item for item in materials if item.get("importance_level") == "high"]),
            "bound_stock_count": active_stock_count,
            "latest_heat_score": latest_heat_score,
            "last_updated_at": _max_datetime(last_updated_candidates),
        },
        "heat_trends": heat_trends,
        "latest_snapshot": snapshots[0] if snapshots else None,
        "analysis_snapshots": snapshots,
        "materials": materials,
        "stocks": stocks,
        "tags": tags,
    }


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


def list_materials(
    db: Session,
    track_id: int,
    statuses: list[str] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict]:
    stmt = (
        select(TrackMaterial)
        .where(TrackMaterial.track_id == track_id)
        .order_by(TrackMaterial.updated_at.desc(), TrackMaterial.id.desc())
    )
    if statuses:
        stmt = stmt.where(TrackMaterial.status.in_(statuses))
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    return _material_dicts(db, list(db.scalars(stmt)))


def list_materials_page(
    db: Session,
    track_id: int,
    statuses: list[str] | None = None,
    limit: int | None = 50,
    offset: int = 0,
) -> Page[dict]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    stmt = (
        select(TrackMaterial)
        .where(TrackMaterial.track_id == track_id)
        .order_by(TrackMaterial.updated_at.desc(), TrackMaterial.id.desc())
    )
    count_stmt = select(func.count(TrackMaterial.id)).where(TrackMaterial.track_id == track_id)
    if statuses:
        stmt = stmt.where(TrackMaterial.status.in_(statuses))
        count_stmt = count_stmt.where(TrackMaterial.status.in_(statuses))
    total = int(db.scalar(count_stmt) or 0)
    items = list(db.scalars(stmt.limit(safe_limit).offset(safe_offset)))
    return make_page(_material_dicts(db, items), total, safe_limit, safe_offset)


def list_all_materials(
    db: Session,
    track_id: int | None = None,
    statuses: list[str] | None = None,
    limit: int | None = 100,
    offset: int = 0,
) -> list[dict]:
    stmt = select(TrackMaterial).order_by(TrackMaterial.updated_at.desc(), TrackMaterial.id.desc())
    if track_id is not None:
        stmt = stmt.where(TrackMaterial.track_id == track_id)
    if statuses:
        stmt = stmt.where(TrackMaterial.status.in_(statuses))
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    items = list(db.scalars(stmt))
    track_ids = {item.track_id for item in items}
    track_by_id = {track.id: track for track in db.scalars(select(Track).where(Track.id.in_(track_ids)))} if track_ids else {}
    return _material_dicts(db, items, track_by_id=track_by_id)


def list_all_materials_page(
    db: Session,
    track_id: int | None = None,
    statuses: list[str] | None = None,
    limit: int | None = 50,
    offset: int = 0,
) -> Page[dict]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    stmt = select(TrackMaterial).order_by(TrackMaterial.updated_at.desc(), TrackMaterial.id.desc())
    count_stmt = select(func.count(TrackMaterial.id))
    if track_id is not None:
        stmt = stmt.where(TrackMaterial.track_id == track_id)
        count_stmt = count_stmt.where(TrackMaterial.track_id == track_id)
    if statuses:
        stmt = stmt.where(TrackMaterial.status.in_(statuses))
        count_stmt = count_stmt.where(TrackMaterial.status.in_(statuses))
    total = int(db.scalar(count_stmt) or 0)
    items = list(db.scalars(stmt.limit(safe_limit).offset(safe_offset)))
    track_ids = {item.track_id for item in items}
    track_by_id = {track.id: track for track in db.scalars(select(Track).where(Track.id.in_(track_ids)))} if track_ids else {}
    return make_page(_material_dicts(db, items, track_by_id=track_by_id), total, safe_limit, safe_offset)


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


def _analysis_snapshot_dict(snapshot: TrackAnalysisSnapshot) -> dict:
    return {
        "id": snapshot.id,
        "track_id": snapshot.track_id,
        "analysis_date": snapshot.analysis_date,
        "market_space": snapshot.market_space,
        "market_size": snapshot.market_size,
        "growth_rate": snapshot.growth_rate,
        "heat_summary": snapshot.heat_summary,
        "ai_summary": snapshot.ai_summary,
        "opportunity_points": snapshot.opportunity_points,
        "risk_points": snapshot.risk_points,
        "watch_signals": snapshot.watch_signals,
        "score": snapshot.score,
        "confidence_level": snapshot.confidence_level,
        "created_at": snapshot.created_at,
    }


def _isoformat(value: object) -> str | None:
    if value is None:
        return None
    formatter = getattr(value, "isoformat", None)
    return formatter() if callable(formatter) else str(value)


def _max_datetime(values) -> object | None:
    items = [item for item in values if item is not None]
    if not items:
        return None
    return max(items, key=lambda item: item.timestamp())


def _track_detail_stocks(db: Session, track_id: int) -> list[dict]:
    rows = db.execute(
        select(StockTrackRelation, Stock)
        .join(Stock, Stock.id == StockTrackRelation.stock_id)
        .where(StockTrackRelation.track_id == track_id)
        .order_by(
            StockTrackRelation.status.asc(),
            StockTrackRelation.updated_at.desc(),
            StockTrackRelation.id.desc(),
        )
    ).all()
    return [
        {
            "id": relation.id,
            "stock_id": relation.stock_id,
            "track_id": relation.track_id,
            "stock_name": stock.stock_name,
            "stock_code": stock.stock_code,
            "symbol": stock.symbol,
            "relation_type": relation.relation_type,
            "conviction": relation.conviction,
            "reason": relation.reason,
            "status": relation.status,
            "created_at": relation.created_at,
            "updated_at": relation.updated_at,
        }
        for relation, stock in rows
    ]


def _track_detail_heat_trends(db: Session, active_tag_ids: list[int]) -> list[dict]:
    if not active_tag_ids:
        return []
    rows = list(
        db.scalars(
            select(TagHeatSnapshot)
            .where(TagHeatSnapshot.tag_id.in_(active_tag_ids))
            .order_by(TagHeatSnapshot.window_type.asc(), TagHeatSnapshot.stat_time.asc(), TagHeatSnapshot.id.asc())
        )
    )
    grouped: dict[tuple[str, object], dict] = {}
    for row in rows:
        key = (row.window_type, row.stat_time)
        item = grouped.setdefault(
            key,
            {
                "stat_time": row.stat_time,
                "heat_score": 0.0,
                "trigger_count": 0,
                "source_count": 0,
                "change_ratio": 0.0,
                "rank_no": row.rank_no,
            },
        )
        item["heat_score"] = round(float(item["heat_score"]) + float(row.heat_score or 0), 2)
        item["trigger_count"] = int(item["trigger_count"]) + int(row.trigger_count or 0)
        item["source_count"] = int(item["source_count"]) + int(row.source_count or 0)
        item["change_ratio"] = round(float(item["change_ratio"] or 0) + float(row.change_ratio or 0), 4)
        if row.rank_no is not None:
            item["rank_no"] = min(int(item["rank_no"] or row.rank_no), int(row.rank_no))

    points_by_window: dict[str, list[dict]] = defaultdict(list)
    for (window_type, _stat_time), point in grouped.items():
        points_by_window[window_type].append(point)
    trends = []
    for window_type in sorted(points_by_window.keys()):
        points = sorted(points_by_window[window_type], key=lambda item: item["stat_time"])
        trends.append({"window_type": window_type, "points": points})
    return trends


def _latest_heat_score(heat_trends: list[dict]) -> float | None:
    preferred = next((item for item in heat_trends if item["window_type"] == "24h"), None)
    trend = preferred or (heat_trends[0] if heat_trends else None)
    if not trend or not trend["points"]:
        return None
    return trend["points"][-1]["heat_score"]


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
    return _material_dicts(db, [item])[0]


def _material_dicts(db: Session, items: list[TrackMaterial], track_by_id: dict[int, Track] | None = None) -> list[dict]:
    source_ids = [item.material_id for item in items if item.material_type == "source_item"]
    note_ids = [item.material_id for item in items if item.material_type == "knowledge_note"]
    source_by_id = {source.id: source for source in db.scalars(select(SourceItem).where(SourceItem.id.in_(source_ids)))} if source_ids else {}
    note_by_id = {note.id: note for note in db.scalars(select(KnowledgeNote).where(KnowledgeNote.id.in_(note_ids)))} if note_ids else {}
    return [_material_dict_from_references(item, source_by_id, note_by_id, track_by_id or {}) for item in items]


def _material_dict_from_references(
    item: TrackMaterial,
    source_by_id: dict[int, SourceItem],
    note_by_id: dict[int, KnowledgeNote],
    track_by_id: dict[int, Track],
) -> dict:
    material = {
        "id": item.id,
        "track_id": item.track_id,
        "track_name": track_by_id[item.track_id].name if item.track_id in track_by_id else None,
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
        source = source_by_id.get(item.material_id)
        if source is not None:
            material.update(
                material_title=source.title,
                material_summary=_summary(source.content),
                material_source_name=source.source_name,
                material_url=source.source_url,
                material_time=source.publish_time or source.created_at,
            )
    elif item.material_type == "knowledge_note":
        note = note_by_id.get(item.material_id)
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
