from collections import defaultdict
from datetime import date, datetime, time, timedelta
from json import dumps

from sqlalchemy import and_, delete, distinct, func, or_, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.system_config.service import get_runtime_state, set_runtime_state
from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.market_radar.backfill_requests import enqueue_tag_backfill
from invest_assistant.modules.market_radar.models import (
    AiTagSuggestion,
    Hotword,
    HotwordTagRelation,
    SourceItem,
    SourceTag,
    StockTagRelation,
    Tag,
    TagEdgeSnapshot,
    TagHeatSnapshot,
    TrackTagRelation,
)
from invest_assistant.modules.market_radar.schemas import (
    AiTagSuggestionApprove,
    AiTagSuggestionCreate,
    HotwordCreate,
    SourceItemCreate,
    TagBindingCreate,
    TagCreate,
    TagUpdate,
)
from invest_assistant.modules.track_discovery.material_generation import create_pending_track_materials_for_source_item
from invest_assistant.shared.pagination import Page, make_page, normalize_limit, normalize_offset
from invest_assistant.shared.time_utils import beijing_now, utc_now

WINDOWS = {
    "24h": timedelta(days=1),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

RANK_CHANGE_BASELINES = {
    "24h": timedelta(hours=1),
    "7d": timedelta(days=1),
    "30d": timedelta(days=7),
}

RANK_CHANGE_REFERENCE_TOLERANCES = {
    "24h": timedelta(hours=3),
    "7d": timedelta(hours=36),
    "30d": timedelta(days=10),
}

EXTRACT_TAGS_STATE_NAMESPACE = "job.market_radar.extract_tags"
EXTRACT_TAGS_SOURCE_ITEM_CURSOR_KEY = "source_item_last_id"
DEFAULT_EXTRACT_TAGS_BATCH_LIMIT = 500

SOURCE_ITEM_DAILY_TYPE_GROUPS = {
    "news": {"news"},
    "announcement": {"announcement", "financial"},
    "sentiment": {"sentiment"},
    "report": {"research", "research_report", "report", "report_summary"},
}

SOURCE_ITEM_IMPORTANT_KEYWORDS = (
    "重要",
    "重大",
    "风口",
    "电报解读",
    "预增",
    "预减",
    "停牌",
    "复牌",
    "重组",
    "并购",
    "处罚",
    "监管",
    "芯片",
    "半导体",
    "AI",
    "算力",
)


def ensure_tag(
    db: Session,
    name: str,
    tag_type: str | None = None,
    source: str | None = None,
    status: str = "active",
    commit: bool = False,
) -> Tag:
    normalized = str(name or "").strip()
    if not normalized:
        raise ValueError("tag name is required")
    tag = db.scalar(select(Tag).where(func.lower(Tag.name) == normalized.lower()))
    if tag is None:
        tag = Tag(name=normalized, type=tag_type, source=source, status=status)
        db.add(tag)
        db.flush()
    else:
        tag.name = normalized
        tag.type = tag_type or tag.type
        tag.source = source or tag.source
        tag.status = status or tag.status
    if commit:
        db.commit()
        db.refresh(tag)
        enqueue_tag_backfill(db, tag)
        db.commit()
    return tag


def list_tags(db: Session, tag_type: str | None = None) -> list[Tag]:
    stmt = select(Tag).order_by(Tag.type.asc().nulls_last(), Tag.name.asc())
    if tag_type:
        stmt = stmt.where(Tag.type == tag_type)
    return list(db.scalars(stmt))


def count_tags(db: Session, tag_type: str | None = None, status: str | None = None) -> int:
    stmt = select(func.count(Tag.id))
    if tag_type:
        stmt = stmt.where(Tag.type == tag_type)
    if status:
        stmt = stmt.where(Tag.status == status)
    return int(db.scalar(stmt) or 0)


def create_tag(db: Session, payload: TagCreate) -> Tag:
    tag = ensure_tag(db, payload.name, payload.type, payload.source, payload.status, commit=True)
    return tag


def create_projected_tag(db: Session, payload: TagCreate) -> Tag:
    return create_tag(db, payload)


def get_tag(db: Session, tag_id: int) -> Tag | None:
    return db.get(Tag, tag_id)


def update_tag(db: Session, tag: Tag, payload: TagUpdate) -> Tag:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    db.commit()
    db.refresh(tag)
    enqueue_tag_backfill(db, tag)
    db.commit()
    return tag


def disable_tag(db: Session, tag: Tag) -> Tag:
    tag.status = "archived"
    db.commit()
    db.refresh(tag)
    return tag


def bind_stock_tag(db: Session, stock_id: int, payload: TagBindingCreate, enqueue_backfill: bool = True) -> dict:
    tag = ensure_tag(db, payload.name, "stock", payload.source, payload.status)
    relation = db.scalar(select(StockTagRelation).where(StockTagRelation.stock_id == stock_id, StockTagRelation.tag_id == tag.id))
    if relation is None:
        relation = StockTagRelation(stock_id=stock_id, tag_id=tag.id, source=payload.source, status=payload.status)
        db.add(relation)
    else:
        relation.source = payload.source or relation.source
        relation.status = payload.status
    db.commit()
    db.refresh(relation)
    if enqueue_backfill:
        enqueue_tag_backfill(db, tag)
        db.commit()
    return _tag_binding_dict(relation, tag)


def list_stock_tag_bindings(db: Session, stock_id: int) -> list[dict]:
    rows = db.execute(
        select(StockTagRelation, Tag)
        .join(Tag, Tag.id == StockTagRelation.tag_id)
        .where(StockTagRelation.stock_id == stock_id)
        .order_by(Tag.name.asc())
    ).all()
    return [_tag_binding_dict(relation, tag) for relation, tag in rows]


def disable_stock_tag_binding(db: Session, relation_id: int) -> dict | None:
    relation = db.get(StockTagRelation, relation_id)
    if relation is None:
        return None
    relation.status = "archived"
    db.commit()
    tag = db.get(Tag, relation.tag_id)
    return _tag_binding_dict(relation, tag)


def bind_track_tag(db: Session, track_id: int, payload: TagBindingCreate, enqueue_backfill: bool = True) -> dict:
    tag = ensure_tag(db, payload.name, "track", payload.source, payload.status)
    relation = db.scalar(select(TrackTagRelation).where(TrackTagRelation.track_id == track_id, TrackTagRelation.tag_id == tag.id))
    if relation is None:
        relation = TrackTagRelation(track_id=track_id, tag_id=tag.id, source=payload.source, status=payload.status)
        db.add(relation)
    else:
        relation.source = payload.source or relation.source
        relation.status = payload.status
    db.commit()
    db.refresh(relation)
    if enqueue_backfill:
        enqueue_tag_backfill(db, tag)
        db.commit()
    return _tag_binding_dict(relation, tag)


def list_track_tag_bindings(db: Session, track_id: int) -> list[dict]:
    rows = db.execute(
        select(TrackTagRelation, Tag)
        .join(Tag, Tag.id == TrackTagRelation.tag_id)
        .where(TrackTagRelation.track_id == track_id)
        .order_by(Tag.name.asc())
    ).all()
    return [_tag_binding_dict(relation, tag) for relation, tag in rows]


def disable_track_tag_binding(db: Session, relation_id: int) -> dict | None:
    relation = db.get(TrackTagRelation, relation_id)
    if relation is None:
        return None
    relation.status = "archived"
    db.commit()
    tag = db.get(Tag, relation.tag_id)
    return _tag_binding_dict(relation, tag)


def create_hotword(db: Session, payload: HotwordCreate, enqueue_backfill: bool = True) -> dict:
    name = payload.name.strip()
    hotword = db.scalar(select(Hotword).where(func.lower(Hotword.name) == name.lower()))
    if hotword is None:
        hotword = Hotword(name=name, description=payload.description, status=payload.status)
        db.add(hotword)
        db.flush()
    else:
        hotword.description = payload.description
        hotword.status = payload.status
    db.commit()
    db.refresh(hotword)
    bind_hotword_tag(
        db,
        hotword.id,
        TagBindingCreate(name=hotword.name, source="system", status=hotword.status),
        enqueue_backfill=enqueue_backfill,
    )
    return hotword_dict(db, hotword)


def list_hotwords(db: Session, status: str | None = None) -> list[dict]:
    stmt = select(Hotword).order_by(Hotword.name.asc())
    if status:
        stmt = stmt.where(Hotword.status == status)
    return [hotword_dict(db, hotword) for hotword in db.scalars(stmt)]


def list_hotwords_page(
    db: Session,
    status: str | None = None,
    q: str | None = None,
    limit: int | None = 50,
    offset: int = 0,
) -> Page[dict]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    stmt = select(Hotword).order_by(Hotword.name.asc())
    count_stmt = select(func.count(Hotword.id))
    if status:
        stmt = stmt.where(Hotword.status == status)
        count_stmt = count_stmt.where(Hotword.status == status)
    query = str(q or "").strip()
    if query:
        condition = Hotword.name.ilike(f"%{query}%")
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    total = int(db.scalar(count_stmt) or 0)
    rows = list(db.scalars(stmt.limit(safe_limit).offset(safe_offset)))
    return make_page([hotword_dict(db, hotword) for hotword in rows], total, safe_limit, safe_offset)


def count_hotwords(db: Session, status: str | None = None) -> int:
    stmt = select(func.count(Hotword.id))
    if status:
        stmt = stmt.where(Hotword.status == status)
    return int(db.scalar(stmt) or 0)


def hotword_stats(db: Session, target_date: date | None = None) -> dict[str, int]:
    day = target_date or beijing_now().date()
    start_at = datetime.combine(day, time.min)
    end_at = start_at + timedelta(days=1)
    return {
        "total": count_hotwords(db),
        "active": count_hotwords(db, "active"),
        "today": int(
            db.scalar(
                select(func.count(Hotword.id)).where(
                    Hotword.created_at >= start_at,
                    Hotword.created_at < end_at,
                )
            )
            or 0
        ),
    }


def get_hotword(db: Session, hotword_id: int) -> dict | None:
    hotword = db.get(Hotword, hotword_id)
    return hotword_dict(db, hotword) if hotword is not None else None


def bind_hotword_tag(db: Session, hotword_id: int, payload: TagBindingCreate, enqueue_backfill: bool = True) -> dict:
    tag = ensure_tag(db, payload.name, "hotword", payload.source, payload.status)
    relation = db.scalar(
        select(HotwordTagRelation).where(HotwordTagRelation.hotword_id == hotword_id, HotwordTagRelation.tag_id == tag.id)
    )
    if relation is None:
        relation = HotwordTagRelation(hotword_id=hotword_id, tag_id=tag.id, source=payload.source, status=payload.status)
        db.add(relation)
    else:
        relation.source = payload.source or relation.source
        relation.status = payload.status
    db.commit()
    db.refresh(relation)
    if enqueue_backfill:
        enqueue_tag_backfill(db, tag)
        db.commit()
    return _tag_binding_dict(relation, tag)


def list_hotword_tag_bindings(db: Session, hotword_id: int) -> list[dict]:
    rows = db.execute(
        select(HotwordTagRelation, Tag)
        .join(Tag, Tag.id == HotwordTagRelation.tag_id)
        .where(HotwordTagRelation.hotword_id == hotword_id)
        .order_by(Tag.name.asc())
    ).all()
    return [_tag_binding_dict(relation, tag) for relation, tag in rows]


def disable_hotword_tag_binding(db: Session, relation_id: int) -> dict | None:
    relation = db.get(HotwordTagRelation, relation_id)
    if relation is None:
        return None
    relation.status = "archived"
    db.commit()
    tag = db.get(Tag, relation.tag_id)
    return _tag_binding_dict(relation, tag)


def create_source_item(db: Session, payload: SourceItemCreate) -> dict:
    from invest_assistant.modules.stock_analysis.service import create_pending_stock_materials_for_source_item
    existing = find_duplicate_source_item(db, payload)
    if existing is not None:
        persist_source_tag_matches(db, existing)
        create_pending_track_materials_for_source_item(db, existing.id)
        create_pending_stock_materials_for_source_item(db, existing.id)
        db.commit()
        db.refresh(existing)
        return _source_item_dict(db, existing)
    item = SourceItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    persist_source_tag_matches(db, item)
    create_pending_track_materials_for_source_item(db, item.id)
    create_pending_stock_materials_for_source_item(db, item.id)
    db.commit()
    db.refresh(item)
    return _source_item_dict(db, item)


def find_duplicate_source_item(db: Session, payload: SourceItemCreate) -> SourceItem | None:
    if payload.source_url:
        existing_by_url = db.scalar(
            select(SourceItem).where(
                SourceItem.source_type == payload.source_type,
                SourceItem.source_name == payload.source_name,
                SourceItem.source_url == payload.source_url,
            )
        )
        if existing_by_url is not None:
            return existing_by_url
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


def _source_item_filter_conditions(
    *,
    q: str | None = None,
    source_name: str | None = None,
    source_type: str | None = None,
    important_only: bool = False,
    tag_id: int | None = None,
) -> list:
    conditions = []
    query = str(q or "").strip()
    if query:
        like_query = f"%{query}%"
        conditions.append(or_(SourceItem.title.ilike(like_query), SourceItem.content.ilike(like_query)))
    source_name_value = str(source_name or "").strip()
    if source_name_value:
        conditions.append(SourceItem.source_name == source_name_value)
    source_type_value = str(source_type or "").strip()
    if source_type_value:
        conditions.append(SourceItem.source_type == source_type_value)
    if important_only:
        important_conditions = []
        for keyword in SOURCE_ITEM_IMPORTANT_KEYWORDS:
            like_keyword = f"%{keyword}%"
            important_conditions.append(SourceItem.title.ilike(like_keyword))
            important_conditions.append(SourceItem.content.ilike(like_keyword))
        conditions.append(or_(*important_conditions))
    if tag_id is not None:
        conditions.append(SourceItem.id.in_(select(SourceTag.source_item_id).where(SourceTag.tag_id == tag_id)))
    return conditions


def list_source_items(
    db: Session,
    limit: int | None = 100,
    offset: int = 0,
    q: str | None = None,
    source_name: str | None = None,
    source_type: str | None = None,
    important_only: bool = False,
    tag_id: int | None = None,
) -> list[dict]:
    conditions = _source_item_filter_conditions(
        q=q,
        source_name=source_name,
        source_type=source_type,
        important_only=important_only,
        tag_id=tag_id,
    )
    stmt = select(SourceItem).where(*conditions).order_by(SourceItem.publish_time.desc().nullslast(), SourceItem.id.desc())
    if offset > 0:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(normalize_limit(limit))
    items = list(db.scalars(stmt))
    return _source_item_dicts(db, items)


def list_source_items_page(
    db: Session,
    limit: int | None = 100,
    offset: int = 0,
    q: str | None = None,
    source_name: str | None = None,
    source_type: str | None = None,
    important_only: bool = False,
    tag_id: int | None = None,
) -> Page[dict]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    conditions = _source_item_filter_conditions(
        q=q,
        source_name=source_name,
        source_type=source_type,
        important_only=important_only,
        tag_id=tag_id,
    )
    stmt = select(SourceItem).where(*conditions).order_by(SourceItem.publish_time.desc().nullslast(), SourceItem.id.desc())
    total = count_source_items(
        db,
        q=q,
        source_name=source_name,
        source_type=source_type,
        important_only=important_only,
        tag_id=tag_id,
    )
    items = list(db.scalars(stmt.limit(safe_limit).offset(safe_offset)))
    return make_page(_source_item_dicts(db, items), total, safe_limit, safe_offset)


def count_source_items(
    db: Session,
    q: str | None = None,
    source_name: str | None = None,
    source_type: str | None = None,
    important_only: bool = False,
    tag_id: int | None = None,
) -> int:
    conditions = _source_item_filter_conditions(
        q=q,
        source_name=source_name,
        source_type=source_type,
        important_only=important_only,
        tag_id=tag_id,
    )
    return int(db.scalar(select(func.count()).select_from(SourceItem).where(*conditions)) or 0)


def count_source_items_by_day(db: Session, target_date: date | None = None) -> dict[str, int]:
    day = target_date or beijing_now().date()
    start_at = datetime.combine(day, time.min)
    end_at = start_at + timedelta(days=1)
    rows = db.execute(
        select(SourceItem.source_type, func.count())
        .where(
            or_(
                and_(SourceItem.publish_time >= start_at, SourceItem.publish_time < end_at),
                and_(
                    SourceItem.publish_time.is_(None),
                    SourceItem.created_at >= start_at,
                    SourceItem.created_at < end_at,
                ),
            )
        )
        .group_by(SourceItem.source_type)
    ).all()

    stats = {key: 0 for key in SOURCE_ITEM_DAILY_TYPE_GROUPS}
    stats["total"] = 0
    for source_type, count in rows:
        next_count = int(count or 0)
        stats["total"] += next_count
        for group_key, source_types in SOURCE_ITEM_DAILY_TYPE_GROUPS.items():
            if source_type in source_types:
                stats[group_key] += next_count
                break
    return stats


def get_source_item(db: Session, source_item_id: int) -> dict | None:
    item = db.get(SourceItem, source_item_id)
    return _source_item_dict(db, item) if item is not None else None


def persist_source_tag_matches(
    db: Session,
    item: SourceItem,
    tag_type: str | None = None,
    tag_id: int | None = None,
    tag_ids: list[int] | None = None,
    overwrite: bool = False,
) -> int:
    text = f"{item.title}\n{item.content}".casefold()
    stmt = select(Tag).where(Tag.status == "active")
    if tag_type and tag_type != "all":
        stmt = stmt.where(Tag.type == tag_type)
    scoped_tag_ids = _normalize_backfill_tag_ids(tag_id, tag_ids)
    if scoped_tag_ids is not None:
        stmt = stmt.where(Tag.id.in_(scoped_tag_ids))
    inserted = 0
    for tag in db.scalars(stmt):
        token = tag.name.strip()
        if not token or token.casefold() not in text:
            continue
        exists = db.scalar(select(SourceTag).where(SourceTag.source_item_id == item.id, SourceTag.tag_id == tag.id))
        if exists is not None:
            if overwrite:
                exists.trigger_text = token
                exists.extractor = "rule"
                exists.confidence = 1.0
            continue
        db.add(SourceTag(source_item_id=item.id, tag_id=tag.id, trigger_text=token, confidence=1.0, extractor="rule"))
        inserted += 1
    return inserted


def _parse_datetime(value: datetime | str | None) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _normalize_backfill_tag_ids(tag_id: int | None = None, tag_ids: list[int] | None = None) -> list[int] | None:
    values: list[int] = []
    if tag_id is not None:
        values.append(int(tag_id))
    if tag_ids is not None:
        values.extend(int(item) for item in tag_ids if item is not None)
    normalized = sorted(set(values))
    return normalized or None


def backfill_source_tags(
    db: Session,
    tag_type: str | None = None,
    tag_id: int | None = None,
    tag_ids: list[int] | None = None,
    start_time: datetime | str | None = None,
    end_time: datetime | str | None = None,
    source_type: str | None = None,
    overwrite: bool = False,
) -> JobResult:
    from invest_assistant.modules.stock_analysis.service import create_pending_stock_materials_for_source_item
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
    scoped_tag_ids = _normalize_backfill_tag_ids(tag_id, tag_ids)
    inserted = 0
    material_inserted = 0
    for item in items:
        inserted += persist_source_tag_matches(
            db,
            item,
            tag_type=tag_type,
            tag_ids=scoped_tag_ids,
            overwrite=overwrite,
        )
        material_inserted += create_pending_track_materials_for_source_item(
            db,
            item.id,
            scoped_tag_ids,
        )
        create_pending_stock_materials_for_source_item(
            db,
            item.id,
            scoped_tag_ids,
        )
    db.commit()
    return JobResult(
        success=True,
        message=f"backfilled {inserted} source tags and {material_inserted} track materials",
        processed_count=len(items),
        inserted_count=inserted,
        extra={"track_material_inserted_count": material_inserted},
    )


def _normalize_extract_tags_batch_limit(value: int | str | None) -> int:
    try:
        limit = int(value or DEFAULT_EXTRACT_TAGS_BATCH_LIMIT)
    except (TypeError, ValueError):
        return DEFAULT_EXTRACT_TAGS_BATCH_LIMIT
    return limit if limit > 0 else DEFAULT_EXTRACT_TAGS_BATCH_LIMIT


def _runtime_state_int_value(value: str | None) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def extract_tags(db: Session, batch_limit: int | str | None = DEFAULT_EXTRACT_TAGS_BATCH_LIMIT) -> JobResult:
    from invest_assistant.modules.stock_analysis.service import create_pending_stock_materials_for_source_item

    limit = _normalize_extract_tags_batch_limit(batch_limit)
    state = get_runtime_state(db, EXTRACT_TAGS_STATE_NAMESPACE, EXTRACT_TAGS_SOURCE_ITEM_CURSOR_KEY)
    latest_source_item_id = int(db.scalar(select(func.max(SourceItem.id))) or 0)
    if state is None:
        set_runtime_state(
            db,
            EXTRACT_TAGS_STATE_NAMESPACE,
            EXTRACT_TAGS_SOURCE_ITEM_CURSOR_KEY,
            str(latest_source_item_id),
            value_type="int",
            ext={"initialized_from": "extract_tags"},
        )
        return JobResult(
            success=True,
            message=f"initialized source item cursor at {latest_source_item_id}",
            processed_count=0,
            inserted_count=0,
            extra={
                "old_cursor": None,
                "new_cursor": latest_source_item_id,
                "batch_limit": limit,
                "remaining_count": 0,
            },
        )

    old_cursor = _runtime_state_int_value(state.state_value)
    items = list(
        db.scalars(
            select(SourceItem)
            .where(SourceItem.id > old_cursor)
            .order_by(SourceItem.id.asc())
            .limit(limit)
        )
    )
    if not items:
        return JobResult(
            success=True,
            message="no new source items to extract tags",
            processed_count=0,
            inserted_count=0,
            extra={
                "old_cursor": old_cursor,
                "new_cursor": old_cursor,
                "batch_limit": limit,
                "remaining_count": 0,
            },
        )

    inserted = 0
    track_material_inserted = 0
    stock_material_inserted = 0
    for item in items:
        inserted += persist_source_tag_matches(db, item)
        track_material_inserted += create_pending_track_materials_for_source_item(db, item.id)
        stock_material_inserted += create_pending_stock_materials_for_source_item(db, item.id)

    new_cursor = int(items[-1].id)
    remaining_count = int(db.scalar(select(func.count(SourceItem.id)).where(SourceItem.id > new_cursor)) or 0)
    set_runtime_state(
        db,
        EXTRACT_TAGS_STATE_NAMESPACE,
        EXTRACT_TAGS_SOURCE_ITEM_CURSOR_KEY,
        str(new_cursor),
        value_type="int",
        ext={
            "track_material_inserted_count": track_material_inserted,
            "stock_material_inserted_count": stock_material_inserted,
        },
        commit=False,
    )
    db.commit()
    return JobResult(
        success=True,
        message=f"extracted {inserted} source tags from {len(items)} new source items",
        processed_count=len(items),
        inserted_count=inserted,
        extra={
            "old_cursor": old_cursor,
            "new_cursor": new_cursor,
            "batch_limit": limit,
            "remaining_count": remaining_count,
        },
    )


def aggregate_heat(db: Session) -> JobResult:
    now = db.scalar(select(func.max(SourceItem.publish_time))) or utc_now()
    inserted = 0
    for window, delta in WINDOWS.items():
        since = now - delta
        db.execute(delete(TagHeatSnapshot).where(TagHeatSnapshot.window_type == window, TagHeatSnapshot.stat_time == now))
        current_rows = _heat_rows_between(db, since, now, include_null_publish=True, include_end=True)
        sorted_rows = sorted(
            current_rows,
            key=lambda row: (-_heat_score(int(row[1]), int(row[2])), int(row[0])),
        )
        for idx, row in enumerate(sorted_rows, start=1):
            tag_id = int(row[0])
            trigger_count = int(row[1])
            source_count = int(row[2])
            heat_score = _heat_score(trigger_count, source_count)
            db.add(
                TagHeatSnapshot(
                    tag_id=tag_id,
                    window_type=window,
                    stat_time=now,
                    trigger_count=trigger_count,
                    source_count=source_count,
                    heat_score=heat_score,
                    avg_count=float(trigger_count),
                    rank_no=idx,
                )
            )
            inserted += 1
    db.commit()
    return JobResult(success=True, message=f"created {inserted} heat snapshots", inserted_count=inserted)


def _heat_rows_between(
    db: Session,
    start_at: datetime,
    end_at: datetime,
    *,
    include_null_publish: bool,
    include_end: bool,
):
    publish_filters = [SourceItem.publish_time >= start_at]
    publish_filters.append(SourceItem.publish_time <= end_at if include_end else SourceItem.publish_time < end_at)
    publish_filter = and_(*publish_filters)
    if include_null_publish:
        publish_filter = or_(SourceItem.publish_time.is_(None), publish_filter)
    return db.execute(
        select(SourceTag.tag_id, func.count(SourceTag.id), func.count(distinct(SourceTag.source_item_id)))
        .join(SourceItem, SourceItem.id == SourceTag.source_item_id)
        .where(publish_filter)
        .group_by(SourceTag.tag_id)
    ).all()


def _heat_score(trigger_count: int, source_count: int) -> float:
    return float(trigger_count)


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
            related_tags = [tag_id for tag_id in tag_ids if tags_by_id.get(tag_id) and tags_by_id[tag_id].type in {"track", "hotword"}]
            for stock_tag_id in stock_tags:
                for related_tag_id in related_tags:
                    edge_sources[(stock_tag_id, related_tag_id)].add(source_id)
            
            # Pair track and hotword tags
            track_tags = [tag_id for tag_id in tag_ids if tags_by_id.get(tag_id) and tags_by_id[tag_id].type == "track"]
            hotword_tags = [tag_id for tag_id in tag_ids if tags_by_id.get(tag_id) and tags_by_id[tag_id].type == "hotword"]
            for track_tag_id in track_tags:
                for hotword_tag_id in hotword_tags:
                    edge_sources[(track_tag_id, hotword_tag_id)].add(source_id)

        for (stock_tag_id, related_tag_id), source_ids in edge_sources.items():
            related = tags_by_id[related_tag_id]
            stock_tag = tags_by_id[stock_tag_id]
            count = len(source_ids)
            if stock_tag.type == "track" and related.type == "hotword":
                rel_type = "track_hotword"
            else:
                rel_type = related.type or "general"
            db.add(
                TagEdgeSnapshot(
                    stock_tag_id=stock_tag_id,
                    related_tag_id=related_tag_id,
                    related_tag_type=rel_type,
                    window_type=window,
                    stat_time=now,
                    cooccur_count=count,
                    source_count=count,
                    weight=float(count),
                    latest_source_item_id=max(source_ids),
                )
            )
            inserted += 1
    db.commit()
    return JobResult(success=True, message=f"created {inserted} edge snapshots", inserted_count=inserted)


def latest_rankings(db: Session, tag_type: str, window: str) -> list[dict]:
    latest_stat = db.scalar(select(func.max(TagHeatSnapshot.stat_time)).where(TagHeatSnapshot.window_type == window))
    if latest_stat is None:
        return []
    previous_stat = rank_change_reference_stat_time(db, window, latest_stat)
    previous_ranks = {}
    if previous_stat is not None:
        previous_ranks = _rank_no_by_tag_for_snapshot(db, window, previous_stat, tag_type)
    stmt = select(TagHeatSnapshot, Tag).join(Tag, Tag.id == TagHeatSnapshot.tag_id).where(
        TagHeatSnapshot.window_type == window, TagHeatSnapshot.stat_time == latest_stat
    )
    if tag_type != "all":
        stmt = stmt.where(Tag.type == tag_type)
    stmt = stmt.order_by(TagHeatSnapshot.rank_no.asc())
    rows = db.execute(stmt).all()
    result = []
    current_ranks = _rank_no_by_tag_for_rows(rows, tag_type)
    for snapshot, tag in rows:
        if window == "24h" and int(snapshot.trigger_count or 0) < 2:
            continue
        current_rank_no = current_ranks[int(snapshot.tag_id)]
        snapshot_data = _snapshot_dict(snapshot)
        snapshot_data["rank_no"] = current_rank_no
        result.append(dict(snapshot_data, **_rank_movement_dict(snapshot, previous_ranks, current_rank_no), tag=_tag_dict(tag)))
    return result


def tag_trend(db: Session, tag_id: int) -> list[TagHeatSnapshot]:
    return list(db.scalars(select(TagHeatSnapshot).where(TagHeatSnapshot.tag_id == tag_id).order_by(TagHeatSnapshot.stat_time.asc())))


def rank_change_reference_stat_time(db: Session, window: str, latest_stat: datetime, *extra_conditions) -> datetime | None:
    baseline = RANK_CHANGE_BASELINES.get(window)
    tolerance = RANK_CHANGE_REFERENCE_TOLERANCES.get(window)
    if baseline is None or tolerance is None:
        return None
    target = latest_stat - baseline
    lower_bound = target - tolerance
    return db.scalar(
        select(TagHeatSnapshot.stat_time)
        .where(
            TagHeatSnapshot.window_type == window,
            TagHeatSnapshot.stat_time <= target,
            TagHeatSnapshot.stat_time >= lower_bound,
            *extra_conditions,
        )
        .distinct()
        .order_by(TagHeatSnapshot.stat_time.desc())
        .limit(1)
    )


def _rank_no_by_tag_for_snapshot(db: Session, window: str, stat_time: datetime, tag_type: str) -> dict[int, int]:
    stmt = select(TagHeatSnapshot.tag_id, TagHeatSnapshot.rank_no).where(
        TagHeatSnapshot.window_type == window,
        TagHeatSnapshot.stat_time == stat_time,
    )
    if tag_type != "all":
        stmt = stmt.join(Tag, Tag.id == TagHeatSnapshot.tag_id).where(Tag.type == tag_type)
    rows = list(db.execute(stmt.order_by(TagHeatSnapshot.rank_no.asc())))
    if tag_type == "all":
        return {int(tag_id): int(rank_no) for tag_id, rank_no in rows}
    return {int(tag_id): index for index, (tag_id, _rank_no) in enumerate(rows, start=1)}


def _rank_no_by_tag_for_rows(rows: list[tuple[TagHeatSnapshot, Tag]], tag_type: str) -> dict[int, int]:
    if tag_type == "all":
        return {int(snapshot.tag_id): int(snapshot.rank_no) for snapshot, _tag in rows}
    return {int(snapshot.tag_id): index for index, (snapshot, _tag) in enumerate(rows, start=1)}


def graph_edges(db: Session, related_type: str, window: str) -> dict:
    latest_stat = db.scalar(select(func.max(TagEdgeSnapshot.stat_time)).where(TagEdgeSnapshot.window_type == window))
    if latest_stat is None:
        return {"nodes": [], "edges": []}
    edges = list(
        db.scalars(
            select(TagEdgeSnapshot)
            .where(TagEdgeSnapshot.window_type == window, TagEdgeSnapshot.related_tag_type == related_type, TagEdgeSnapshot.stat_time == latest_stat)
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


def create_ai_tag_suggestion(db: Session, payload: AiTagSuggestionCreate) -> AiTagSuggestion:
    item = AiTagSuggestion(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_ai_tag_suggestions(db: Session) -> list[AiTagSuggestion]:
    return list(db.scalars(select(AiTagSuggestion).order_by(AiTagSuggestion.created_at.desc(), AiTagSuggestion.id.desc())))


def list_ai_tag_suggestions_page(
    db: Session,
    status: str | None = None,
    q: str | None = None,
    limit: int | None = 50,
    offset: int = 0,
) -> Page[AiTagSuggestion]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    stmt = select(AiTagSuggestion).order_by(AiTagSuggestion.created_at.desc(), AiTagSuggestion.id.desc())
    count_stmt = select(func.count(AiTagSuggestion.id))
    if status:
        stmt = stmt.where(AiTagSuggestion.status == status)
        count_stmt = count_stmt.where(AiTagSuggestion.status == status)
    query = str(q or "").strip()
    if query:
        condition = AiTagSuggestion.suggested_text.ilike(f"%{query}%")
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)
    total = int(db.scalar(count_stmt) or 0)
    items = list(db.scalars(stmt.limit(safe_limit).offset(safe_offset)))
    return make_page(items, total, safe_limit, safe_offset)


def count_ai_tag_suggestions(db: Session, status: str | None = None) -> int:
    stmt = select(func.count(AiTagSuggestion.id))
    if status:
        stmt = stmt.where(AiTagSuggestion.status == status)
    return int(db.scalar(stmt) or 0)


def get_ai_tag_suggestion(db: Session, suggestion_id: int) -> AiTagSuggestion | None:
    return db.get(AiTagSuggestion, suggestion_id)


def approve_ai_tag_suggestion(db: Session, suggestion: AiTagSuggestion, payload: AiTagSuggestionApprove) -> AiTagSuggestion:
    final_name = (payload.final_tag_name or suggestion.final_tag_name or suggestion.suggested_text).strip()
    tag = ensure_tag(db, final_name, payload.target_type, "ai", "active")
    if payload.target_type == "stock":
        if payload.target_id is None:
            raise ValueError("target_id is required for stock")
        bind_stock_tag(db, payload.target_id, TagBindingCreate(name=tag.name, source="ai", status="active"))
    elif payload.target_type == "track":
        from invest_assistant.modules.track_discovery.models import Track
        from invest_assistant.modules.track_discovery.schemas import TrackCreate
        from invest_assistant.modules.track_discovery.service import create_track

        track_id = payload.target_id
        if track_id is None:
            if not payload.target_name:
                raise ValueError("target_name is required for track")
            track = create_track(db, TrackCreate(name=payload.target_name, status="candidate"), enqueue_backfill=False)
            track_id = int(track["id"])
        elif db.get(Track, track_id) is None:
            raise ValueError("track not found")
        bind_track_tag(db, track_id, TagBindingCreate(name=tag.name, source="ai", status="active"))
    elif payload.target_type == "hotword":
        hotword_id = payload.target_id
        if hotword_id is None:
            hotword = create_hotword(db, HotwordCreate(name=payload.target_name or final_name, status="active"), enqueue_backfill=False)
            hotword_id = int(hotword["id"])
        elif db.get(Hotword, hotword_id) is None:
            raise ValueError("hotword not found")
        bind_hotword_tag(db, hotword_id, TagBindingCreate(name=tag.name, source="ai", status="active"))
    else:
        raise ValueError("target_type must be stock, track, or hotword")
    suggestion.final_tag_name = final_name
    suggestion.final_tag_id = tag.id
    suggestion.status = "approved"
    db.commit()
    db.refresh(suggestion)
    return suggestion


def reject_ai_tag_suggestion(db: Session, suggestion: AiTagSuggestion) -> AiTagSuggestion:
    suggestion.status = "rejected"
    suggestion.rejected_count = int(suggestion.rejected_count or 0) + 1
    db.commit()
    db.refresh(suggestion)
    return suggestion


def restore_ai_tag_suggestion(db: Session, suggestion: AiTagSuggestion) -> AiTagSuggestion:
    if suggestion.status != "rejected":
        raise ValueError("suggestion is not rejected")
    suggestion.status = "pending"
    db.commit()
    db.refresh(suggestion)
    return suggestion


def _source_item_dicts(db: Session, items: list[SourceItem]) -> list[dict]:
    tags_by_item = _source_tags_by_item(db, [item.id for item in items])
    return [_source_item_dict_from_tags(item, tags_by_item.get(item.id, [])) for item in items]


def _source_tags_by_item(db: Session, source_item_ids: list[int]) -> dict[int, list[dict]]:
    if not source_item_ids:
        return {}
    rows = db.execute(
        select(SourceTag, Tag)
        .join(Tag, Tag.id == SourceTag.tag_id)
        .where(SourceTag.source_item_id.in_(source_item_ids))
        .order_by(SourceTag.source_item_id.asc(), Tag.name.asc())
    ).all()
    tags_by_item: dict[int, list[dict]] = defaultdict(list)
    for source_tag, tag in rows:
        tags_by_item[int(source_tag.source_item_id)].append(
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
        )
    return tags_by_item


def _source_item_dict(db: Session, item: SourceItem) -> dict:
    return _source_item_dict_from_tags(item, _source_tags_by_item(db, [item.id]).get(item.id, []))


def _source_item_dict_from_tags(item: SourceItem, source_tags: list[dict]) -> dict:
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
        "source_tags": source_tags,
    }


def hotword_dict(db: Session, hotword: Hotword) -> dict:
    return {
        "id": hotword.id,
        "name": hotword.name,
        "description": hotword.description,
        "status": hotword.status,
        "tags": list_hotword_tag_bindings(db, hotword.id),
        "created_at": hotword.created_at,
        "updated_at": hotword.updated_at,
    }


def _tag_binding_dict(relation, tag: Tag | None) -> dict:
    return {
        "id": relation.id,
        "tag": _tag_dict(tag) if tag is not None else None,
        "source": relation.source,
        "status": relation.status,
        "created_at": relation.created_at,
        "updated_at": relation.updated_at,
    }


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
        "rank_no": snapshot.rank_no,
        "created_at": snapshot.created_at,
    }


def _rank_movement_dict(snapshot: TagHeatSnapshot, previous_ranks: dict[int, int], current_rank_no: int | None = None) -> dict:
    previous_rank = previous_ranks.get(int(snapshot.tag_id))
    if previous_rank is None:
        return {"previous_rank_no": None, "rank_change": None, "rank_movement": "new"}
    rank_change = int(previous_rank) - int(current_rank_no if current_rank_no is not None else snapshot.rank_no)
    if rank_change > 0:
        movement = "up"
    elif rank_change < 0:
        movement = "down"
    else:
        movement = "flat"
    return {"previous_rank_no": previous_rank, "rank_change": rank_change, "rank_movement": movement}


def _tag_dict(tag: Tag) -> dict:
    return {
        "id": tag.id,
        "name": tag.name,
        "type": tag.type,
        "source": tag.source,
        "status": tag.status,
        "created_at": tag.created_at,
        "updated_at": tag.updated_at,
    }


def ai_suggestion_from_hotword_payload(name: str, score: int | float | None, reason: str | None, ext: dict | None = None) -> AiTagSuggestionCreate:
    return AiTagSuggestionCreate(
        suggested_text=name,
        score=float(score) if score is not None else None,
        reason=reason,
        ext_json=dumps(ext or {}, ensure_ascii=False),
    )
