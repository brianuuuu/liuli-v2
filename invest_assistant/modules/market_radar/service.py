from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import and_, delete, distinct, func, or_, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.market_radar.alias_resolver import resolve_source_tag_matches
from invest_assistant.modules.market_radar.backfill_requests import enqueue_tag_backfill
from invest_assistant.modules.market_radar.models import (
    HotwordAlias,
    SourceItem,
    SourceTag,
    Tag,
    TagCandidate,
    TagEdgeSnapshot,
    TagHeatSnapshot,
)
from invest_assistant.modules.market_radar.schemas import HotwordAliasCreate, HotwordCreate, SourceItemCreate, TagCandidateCreate, TagCreate, TagUpdate
from invest_assistant.shared.time_utils import utc_now

WINDOWS = {
    "1h": timedelta(hours=1),
    "24h": timedelta(days=1),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


def list_tags(db: Session, tag_type: str | None = None) -> list[Tag]:
    stmt = select(Tag).order_by(Tag.type.asc(), Tag.name.asc())
    if tag_type:
        stmt = stmt.where(Tag.type == tag_type)
    return list(db.scalars(stmt))


def create_tag(db: Session, payload: TagCreate) -> Tag:
    existing = db.scalar(select(Tag).where(Tag.name == payload.name, Tag.type == payload.type))
    if existing is not None:
        for key, value in payload.model_dump().items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        enqueue_tag_backfill(db, existing)
        db.commit()
        return existing
    tag = Tag(**payload.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    enqueue_tag_backfill(db, tag)
    db.commit()
    return tag


def create_projected_tag(db: Session, payload: TagCreate) -> Tag:
    return create_tag(db, payload)


def create_hotword(db: Session, payload: HotwordCreate) -> dict:
    tag = create_tag(db, TagCreate(name=payload.name, type="hotword", status=payload.status))
    for alias in payload.aliases:
        create_hotword_alias(db, tag.id, HotwordAliasCreate(alias=alias))
    return {"tag": tag, "aliases": list_hotword_aliases(db, tag.id)}


def create_hotword_alias(db: Session, tag_id: int, payload: HotwordAliasCreate) -> HotwordAlias:
    tag = db.get(Tag, tag_id)
    if tag is None or tag.type != "hotword":
        raise ValueError("hotword tag not found")
    existing = db.scalar(select(HotwordAlias).where(HotwordAlias.tag_id == tag_id, HotwordAlias.alias == payload.alias))
    if existing is not None:
        for key, value in payload.model_dump().items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        enqueue_tag_backfill(db, tag)
        db.commit()
        return existing
    item = HotwordAlias(tag_id=tag_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    enqueue_tag_backfill(db, tag)
    db.commit()
    return item


def list_hotword_aliases(db: Session, tag_id: int | None = None) -> list[HotwordAlias]:
    stmt = select(HotwordAlias).order_by(HotwordAlias.alias.asc())
    if tag_id is not None:
        stmt = stmt.where(HotwordAlias.tag_id == tag_id)
    return list(db.scalars(stmt))


def get_tag(db: Session, tag_id: int) -> Tag | None:
    return db.get(Tag, tag_id)


def update_tag(db: Session, tag: Tag, payload: TagUpdate) -> Tag:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    db.commit()
    db.refresh(tag)
    return tag


def disable_tag(db: Session, tag: Tag) -> Tag:
    tag.status = "disabled"
    db.commit()
    db.refresh(tag)
    return tag


def create_source_item(db: Session, payload: SourceItemCreate) -> SourceItem:
    existing = find_duplicate_source_item(db, payload)
    if existing is not None:
        persist_source_tag_matches(db, existing)
        db.commit()
        db.refresh(existing)
        return existing
    item = SourceItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    persist_source_tag_matches(db, item)
    db.commit()
    db.refresh(item)
    return item


def find_duplicate_source_item(db: Session, payload: SourceItemCreate) -> SourceItem | None:
    if payload.publish_time is None:
        return db.scalar(
            select(SourceItem).where(
                SourceItem.source_type == payload.source_type,
                SourceItem.source_name == payload.source_name,
                SourceItem.publish_time.is_(None),
                SourceItem.title == payload.title,
            )
        )
    return db.scalar(
        select(SourceItem).where(
            SourceItem.source_type == payload.source_type,
            SourceItem.source_name == payload.source_name,
            SourceItem.publish_time == payload.publish_time,
            SourceItem.title == payload.title,
        )
    )


def list_source_items(db: Session) -> list[SourceItem]:
    items = list(db.scalars(select(SourceItem).order_by(SourceItem.publish_time.desc(), SourceItem.id.desc())))
    return [_source_item_dict(db, item) for item in items]


def get_source_item(db: Session, source_item_id: int) -> SourceItem | None:
    item = db.get(SourceItem, source_item_id)
    return _source_item_dict(db, item) if item is not None else None


def persist_source_tag_matches(
    db: Session,
    item: SourceItem,
    tag_type: str | None = None,
    tag_id: int | None = None,
    overwrite: bool = False,
) -> int:
    matches = resolve_source_tag_matches(db, item, tag_type=tag_type, tag_id=tag_id)
    inserted = 0
    for match in matches:
        exists = db.scalar(select(SourceTag).where(SourceTag.source_item_id == item.id, SourceTag.tag_id == match.tag_id))
        if exists is not None:
            if overwrite:
                exists.trigger_text = match.trigger_text
                exists.extractor = match.extractor
                exists.confidence = 1.0
            continue
        db.add(
            SourceTag(
                source_item_id=item.id,
                tag_id=match.tag_id,
                trigger_text=match.trigger_text,
                confidence=1.0,
                extractor=match.extractor,
            )
        )
        inserted += 1
    return inserted


def _parse_datetime(value: datetime | str | None) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def backfill_source_tags(
    db: Session,
    tag_type: str | None = None,
    tag_id: int | None = None,
    start_time: datetime | str | None = None,
    end_time: datetime | str | None = None,
    source_type: str | None = None,
    overwrite: bool = False,
) -> JobResult:
    start_dt = _parse_datetime(start_time)
    end_dt = _parse_datetime(end_time)
    stmt = select(SourceItem).order_by(SourceItem.id.asc())
    if source_type:
        stmt = stmt.where(SourceItem.source_type == source_type)
    item_time = func.coalesce(SourceItem.publish_time, SourceItem.created_at)
    if start_dt is not None:
        stmt = stmt.where(item_time >= start_dt)
    if end_dt is not None:
        stmt = stmt.where(item_time <= end_dt)
    items = list(db.scalars(stmt))
    inserted = 0
    for item in items:
        inserted += persist_source_tag_matches(db, item, tag_type=tag_type, tag_id=tag_id, overwrite=overwrite)
    db.commit()
    return JobResult(
        success=True,
        message=f"backfilled {inserted} source tags",
        processed_count=len(items),
        inserted_count=inserted,
    )


def extract_tags(db: Session) -> JobResult:
    return backfill_source_tags(db)


def _source_item_dict(db: Session, item: SourceItem) -> dict:
    rows = db.execute(
        select(SourceTag, Tag)
        .join(Tag, Tag.id == SourceTag.tag_id)
        .where(SourceTag.source_item_id == item.id)
        .order_by(Tag.type.asc(), Tag.name.asc())
    ).all()
    return {
        "id": item.id,
        "source_type": item.source_type,
        "source_name": item.source_name,
        "title": item.title,
        "content": item.content,
        "source_url": item.source_url,
        "publish_time": item.publish_time,
        "related_type": item.related_type,
        "related_id": item.related_id,
        "created_at": item.created_at,
        "source_tags": [
            {
                "id": source_tag.id,
                "source_item_id": source_tag.source_item_id,
                "tag_id": source_tag.tag_id,
                "trigger_text": source_tag.trigger_text,
                "confidence": source_tag.confidence,
                "extractor": source_tag.extractor,
                "created_at": source_tag.created_at,
                "tag": _tag_dict(tag),
            }
            for source_tag, tag in rows
        ],
    }


def aggregate_heat(db: Session) -> JobResult:
    now = db.scalar(select(func.max(SourceItem.publish_time))) or utc_now()
    inserted = 0
    for window, delta in WINDOWS.items():
        since = now - delta
        db.execute(delete(TagHeatSnapshot).where(TagHeatSnapshot.window_type == window))
        rows = db.execute(
            select(
                SourceTag.tag_id,
                func.count(SourceTag.id),
                func.count(distinct(SourceTag.source_item_id)),
            )
            .join(SourceItem, SourceItem.id == SourceTag.source_item_id)
            .where(or_(SourceItem.publish_time.is_(None), SourceItem.publish_time >= since))
            .group_by(SourceTag.tag_id)
        ).all()
        ranked = sorted(rows, key=lambda row: (-int(row[1]), int(row[0])))
        for idx, row in enumerate(ranked, start=1):
            trigger_count = int(row[1])
            source_count = int(row[2])
            db.add(
                TagHeatSnapshot(
                    tag_id=int(row[0]),
                    window_type=window,
                    stat_time=now,
                    trigger_count=trigger_count,
                    source_count=source_count,
                    heat_score=float(trigger_count * 10 + source_count),
                    avg_count=float(trigger_count),
                    change_ratio=0.0,
                    rank_no=idx,
                )
            )
            inserted += 1
    db.commit()
    return JobResult(success=True, message=f"created {inserted} heat snapshots", inserted_count=inserted)


def aggregate_edges(db: Session) -> JobResult:
    now = db.scalar(select(func.max(SourceItem.publish_time))) or utc_now()
    inserted = 0
    tags_by_id = {tag.id: tag for tag in db.scalars(select(Tag))}
    for window, delta in WINDOWS.items():
        since = now - delta
        db.execute(delete(TagEdgeSnapshot).where(TagEdgeSnapshot.window_type == window))
        source_tags = db.execute(
            select(SourceTag.source_item_id, SourceTag.tag_id)
            .join(SourceItem, SourceItem.id == SourceTag.source_item_id)
            .where(or_(SourceItem.publish_time.is_(None), SourceItem.publish_time >= since))
        ).all()
        by_source: dict[int, list[int]] = defaultdict(list)
        for source_id, tag_id in source_tags:
            by_source[int(source_id)].append(int(tag_id))
        edge_sources: dict[tuple[int, int], set[int]] = defaultdict(set)
        for source_id, tag_ids in by_source.items():
            stock_tags = [tag_id for tag_id in tag_ids if tags_by_id.get(tag_id) and tags_by_id[tag_id].type == "stock"]
            related_tags = [
                tag_id for tag_id in tag_ids if tags_by_id.get(tag_id) and tags_by_id[tag_id].type in {"track", "hotword"}
            ]
            for stock_tag_id in stock_tags:
                for related_tag_id in related_tags:
                    edge_sources[(stock_tag_id, related_tag_id)].add(source_id)
        for (stock_tag_id, related_tag_id), source_ids in edge_sources.items():
            latest_source_item_id = max(source_ids)
            count = len(source_ids)
            related = tags_by_id[related_tag_id]
            db.add(
                TagEdgeSnapshot(
                    stock_tag_id=stock_tag_id,
                    related_tag_id=related_tag_id,
                    related_tag_type=related.type,
                    window_type=window,
                    stat_time=now,
                    cooccur_count=count,
                    source_count=count,
                    weight=float(count),
                    latest_source_item_id=latest_source_item_id,
                )
            )
            inserted += 1
    db.commit()
    return JobResult(success=True, message=f"created {inserted} edge snapshots", inserted_count=inserted)


def latest_rankings(db: Session, tag_type: str, window: str) -> list[dict]:
    latest_stat = db.scalar(select(func.max(TagHeatSnapshot.stat_time)).where(TagHeatSnapshot.window_type == window))
    if latest_stat is None:
        return []
    rows = db.execute(
        select(TagHeatSnapshot, Tag)
        .join(Tag, Tag.id == TagHeatSnapshot.tag_id)
        .where(
            TagHeatSnapshot.window_type == window,
            TagHeatSnapshot.stat_time == latest_stat,
            Tag.type == tag_type,
        )
        .order_by(TagHeatSnapshot.rank_no.asc())
    ).all()
    return [dict(_snapshot_dict(snapshot), tag=_tag_dict(tag)) for snapshot, tag in rows]


def tag_trend(db: Session, tag_id: int) -> list[TagHeatSnapshot]:
    return list(
        db.scalars(select(TagHeatSnapshot).where(TagHeatSnapshot.tag_id == tag_id).order_by(TagHeatSnapshot.stat_time.asc()))
    )


def graph_edges(db: Session, related_type: str, window: str) -> dict:
    latest_stat = db.scalar(select(func.max(TagEdgeSnapshot.stat_time)).where(TagEdgeSnapshot.window_type == window))
    if latest_stat is None:
        return {"nodes": [], "edges": []}
    edges = list(
        db.scalars(
            select(TagEdgeSnapshot)
            .where(
                TagEdgeSnapshot.window_type == window,
                TagEdgeSnapshot.related_tag_type == related_type,
                TagEdgeSnapshot.stat_time == latest_stat,
            )
            .order_by(TagEdgeSnapshot.weight.desc())
        )
    )
    tag_ids = {edge.stock_tag_id for edge in edges} | {edge.related_tag_id for edge in edges}
    tags = {tag.id: tag for tag in db.scalars(select(Tag).where(Tag.id.in_(tag_ids)))} if tag_ids else {}
    return {
        "nodes": [_tag_dict(tag) for tag in tags.values()],
        "edges": [
            {
                "stock_tag": _tag_dict(tags[edge.stock_tag_id]) if edge.stock_tag_id in tags else None,
                "related_tag": _tag_dict(tags[edge.related_tag_id]) if edge.related_tag_id in tags else None,
                "weight": edge.weight,
                "source_count": edge.source_count,
                "latest_source_item_id": edge.latest_source_item_id,
            }
            for edge in edges
        ],
    }


def create_candidate(db: Session, payload: TagCandidateCreate) -> TagCandidate:
    name = payload.name.strip()
    existing = db.scalar(select(TagCandidate).where(func.lower(TagCandidate.name) == name.lower()))
    if existing is not None:
        raise ValueError("candidate name already exists")
    values = payload.model_dump()
    values["name"] = name
    item = TagCandidate(**values)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_candidates(db: Session) -> list[TagCandidate]:
    return list(db.scalars(select(TagCandidate).order_by(TagCandidate.created_at.desc())))


def get_candidate(db: Session, candidate_id: int) -> TagCandidate | None:
    return db.get(TagCandidate, candidate_id)


def approve_candidate(db: Session, candidate: TagCandidate) -> TagCandidate:
    if candidate.suggested_type == "hotword":
        tag = create_tag(db, TagCreate(name=candidate.name, type="hotword", status="active"))
        candidate.target_tag_id = tag.id
    elif candidate.suggested_type == "track":
        from invest_assistant.modules.track_discovery.schemas import TrackCreate
        from invest_assistant.modules.track_discovery.service import create_track

        track = create_track(db, TrackCreate(name=candidate.name, status="candidate"))
        candidate.target_tag_id = track["tag"]["id"] if track.get("tag") else None
    else:
        candidate.target_tag_id = None
    candidate.status = "approved"
    db.commit()
    db.refresh(candidate)
    return candidate


def promote_candidate_to_track(db: Session, candidate: TagCandidate) -> TagCandidate:
    if candidate.status != "pending":
        raise ValueError("candidate is not pending")

    from invest_assistant.modules.track_discovery.models import Track
    from invest_assistant.modules.track_discovery.schemas import TrackCreate
    from invest_assistant.modules.track_discovery.service import create_track

    name = candidate.name.strip()
    existing = db.scalar(select(Track).where(func.lower(Track.name) == name.lower()))
    if existing is not None:
        raise ValueError("track name already exists")

    track = create_track(db, TrackCreate(name=name, status="candidate"))
    candidate.target_tag_id = track["tag"]["id"] if track.get("tag") else None
    candidate.status = "approved"
    db.commit()
    db.refresh(candidate)
    return candidate


def reject_candidate(db: Session, candidate: TagCandidate) -> TagCandidate:
    candidate.status = "rejected"
    db.commit()
    db.refresh(candidate)
    return candidate


def merge_candidate(db: Session, candidate: TagCandidate, target_tag_id: int | None = None) -> TagCandidate:
    resolved_target_id = target_tag_id or candidate.suggested_target_tag_id
    if resolved_target_id is None:
        raise ValueError("target hotword tag is required")
    target = db.get(Tag, resolved_target_id)
    if target is None or target.type != "hotword" or target.status != "active":
        raise ValueError("active hotword tag not found")
    create_hotword_alias(
        db,
        resolved_target_id,
        HotwordAliasCreate(alias=candidate.name, source="ai_suggested", status="active"),
    )
    candidate.target_tag_id = resolved_target_id
    candidate.status = "merged"
    db.commit()
    db.refresh(candidate)
    return candidate


def _snapshot_dict(snapshot: TagHeatSnapshot) -> dict:
    return {
        "id": snapshot.id,
        "tag_id": snapshot.tag_id,
        "window_type": snapshot.window_type,
        "stat_time": snapshot.stat_time,
        "trigger_count": snapshot.trigger_count,
        "source_count": snapshot.source_count,
        "heat_score": snapshot.heat_score,
        "avg_count": snapshot.avg_count,
        "change_ratio": snapshot.change_ratio,
        "rank_no": snapshot.rank_no,
        "created_at": snapshot.created_at,
    }


def _tag_dict(tag: Tag) -> dict:
    return {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "stock_id": tag.stock_id,
        "track_id": tag.track_id,
        "status": tag.status,
        "created_at": tag.created_at,
        "updated_at": tag.updated_at,
    }
