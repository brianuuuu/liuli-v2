from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.basic.stock_master.service import ensure_stock_tag
from invest_assistant.modules.market_radar.models import SourceItem, SourceTag, Tag, StockTagRelation
from invest_assistant.modules.stock_analysis.models import (
    StockCompareGroup,
    StockPoolItem,
    StockResearchNote,
    StockScoreSnapshot,
    StockTrackRelation,
    StockValuationSnapshot,
    StockMaterial,
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


def create_pool_item(db: Session, payload: StockPoolCreate) -> dict:
    existing = db.scalar(select(StockPoolItem).where(StockPoolItem.stock_id == payload.stock_id))
    if existing:
        existing.status = payload.status
        existing.source = payload.source
        existing.reason = payload.reason
        _sync_stock_track_relations(db, existing.stock_id, payload.track_ids)
        db.commit()
        db.refresh(existing)
        ensure_stock_tag(db, existing.stock_id)
        return _pool_item_dict(db, existing)
    item = StockPoolItem(**payload.model_dump(exclude={"track_ids"}))
    db.add(item)
    _sync_stock_track_relations(db, item.stock_id, payload.track_ids)
    db.commit()
    db.refresh(item)
    ensure_stock_tag(db, item.stock_id)
    return _pool_item_dict(db, item)


def update_pool_item(db: Session, pool_id: int, payload: StockPoolCreate) -> dict | None:
    item = db.get(StockPoolItem, pool_id)
    if item is None:
        return None
    item.status = payload.status
    item.source = payload.source
    item.reason = payload.reason
    _sync_stock_track_relations(db, item.stock_id, payload.track_ids)
    db.commit()
    db.refresh(item)
    ensure_stock_tag(db, item.stock_id)
    return _pool_item_dict(db, item)


def list_pool(db: Session) -> list[dict]:
    rows = db.execute(
        select(StockPoolItem, Stock)
        .join(Stock, Stock.id == StockPoolItem.stock_id)
        .order_by(StockPoolItem.updated_at.desc())
    ).all()
    return [_pool_item_dict_from_stock(db, item, stock) for item, stock in rows]


def list_candidates(db: Session) -> list[dict]:
    rows = db.execute(
        select(StockPoolItem, Stock)
        .join(Stock, Stock.id == StockPoolItem.stock_id)
        .where(StockPoolItem.status == "candidate")
        .order_by(StockPoolItem.updated_at.desc())
    ).all()
    return [_pool_item_dict_from_stock(db, item, stock) for item, stock in rows]


def _pool_item_dict(db: Session, item: StockPoolItem) -> dict:
    stock = db.get(Stock, item.stock_id)
    return _pool_item_dict_from_stock(db, item, stock)


def _pool_item_dict_from_stock(db: Session, item: StockPoolItem, stock: Stock | None) -> dict:
    tracks = _active_track_summaries_for_stock(db, item.stock_id)
    return {
        "id": item.id,
        "stock_id": item.stock_id,
        "status": item.status,
        "source": item.source,
        "reason": item.reason,
        "track_ids": [track["id"] for track in tracks],
        "tracks": tracks,
        "symbol": stock.symbol if stock else None,
        "stock_code": stock.stock_code if stock else None,
        "stock_name": stock.stock_name if stock else None,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _active_track_summaries_for_stock(db: Session, stock_id: int) -> list[dict]:
    rows = db.execute(
        select(Track)
        .join(StockTrackRelation, StockTrackRelation.track_id == Track.id)
        .where(StockTrackRelation.stock_id == stock_id, StockTrackRelation.status == "active")
        .order_by(Track.name)
    ).scalars()
    return [_track_dict(track) for track in rows]


def _sync_stock_track_relations(db: Session, stock_id: int, track_ids: list[int]) -> None:
    selected_ids = set(dict.fromkeys(track_ids))
    if selected_ids:
        valid_ids = set(
            db.scalars(select(Track.id).where(Track.id.in_(selected_ids), Track.status != "archived")).all()
        )
        missing_ids = selected_ids - valid_ids
        if missing_ids:
            raise ValueError("track not found or archived")
    relations = list(db.scalars(select(StockTrackRelation).where(StockTrackRelation.stock_id == stock_id)))
    relation_by_track = {relation.track_id: relation for relation in relations}
    for track_id, relation in relation_by_track.items():
        if relation.status == "active" and track_id not in selected_ids:
            relation.status = "disabled"
    for track_id in selected_ids:
        relation = relation_by_track.get(track_id)
        if relation is None:
            db.add(StockTrackRelation(stock_id=stock_id, track_id=track_id, status="active"))
        else:
            relation.status = "active"


def create_note(db: Session, stock_id: int, payload: StockResearchNoteCreate) -> StockResearchNote:
    item = StockResearchNote(stock_id=stock_id, **payload.model_dump())
    db.add(item)
    db.flush()
    db.add(
        StockMaterial(
            stock_id=stock_id,
            material_type="knowledge_note",
            material_id=item.id,
            status="confirmed",
        )
    )
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


def list_score_comparison(db: Session) -> list[dict]:
    rows = db.execute(
        select(StockPoolItem, Stock)
        .join(Stock, Stock.id == StockPoolItem.stock_id)
        .order_by(StockPoolItem.updated_at.desc())
    ).all()
    return [_score_comparison_dict(db, item, stock) for item, stock in rows]


def _score_comparison_dict(db: Session, item: StockPoolItem, stock: Stock) -> dict:
    score = db.scalar(
        select(StockScoreSnapshot)
        .where(StockScoreSnapshot.stock_id == item.stock_id)
        .order_by(StockScoreSnapshot.score_date.desc(), StockScoreSnapshot.id.desc())
        .limit(1)
    )
    row = {
        "stock_id": item.stock_id,
        "symbol": stock.symbol,
        "stock_code": stock.stock_code,
        "stock_name": stock.stock_name,
        "status": item.status,
        "tracks": _active_track_summaries_for_stock(db, item.stock_id),
        "score_id": None,
        "score_date": None,
        "track_id": None,
        "growth_score": None,
        "valuation_score": None,
        "moat_score": None,
        "risk_score": None,
        "total_score": None,
        "created_at": None,
    }
    if score is None:
        return row
    row.update(
        {
            "score_id": score.id,
            "score_date": score.score_date,
            "track_id": score.track_id,
            "growth_score": score.growth_score,
            "valuation_score": score.valuation_score,
            "moat_score": score.moat_score,
            "risk_score": score.risk_score,
            "total_score": score.total_score,
            "created_at": score.created_at,
        }
    )
    return row


def list_valuation_comparison(db: Session) -> list[dict]:
    rows = db.execute(
        select(StockPoolItem, Stock)
        .join(Stock, Stock.id == StockPoolItem.stock_id)
        .order_by(StockPoolItem.updated_at.desc())
    ).all()
    return [_valuation_comparison_dict(db, item, stock) for item, stock in rows]


def _valuation_comparison_dict(db: Session, item: StockPoolItem, stock: Stock) -> dict:
    valuation = db.scalar(
        select(StockValuationSnapshot)
        .where(StockValuationSnapshot.stock_id == item.stock_id)
        .order_by(StockValuationSnapshot.analysis_date.desc(), StockValuationSnapshot.id.desc())
        .limit(1)
    )
    row = {
        "stock_id": item.stock_id,
        "symbol": stock.symbol,
        "stock_code": stock.stock_code,
        "stock_name": stock.stock_name,
        "status": item.status,
        "tracks": _active_track_summaries_for_stock(db, item.stock_id),
        "valuation_id": None,
        "company": None,
        "company_code": None,
        "report_period": None,
        "report_release_date": None,
        "current_market_value": None,
        "financial_performance_json": None,
        "trend_reference_json": None,
        "guidance_check_json": None,
        "quarter_performance": None,
        "quarter_main_reason": None,
        "profit_model_json": None,
        "fcf_model_json": None,
        "revenue_model_json": None,
        "primary_model": None,
        "expected_market_value_3y": None,
        "expectation_gap_rate": None,
        "analysis_date": None,
        "researcher": None,
        "created_at": None,
    }
    if valuation is None:
        return row
    row.update(
        {
            "valuation_id": valuation.id,
            "company": valuation.company,
            "company_code": valuation.company_code,
            "report_period": valuation.report_period,
            "report_release_date": valuation.report_release_date,
            "current_market_value": valuation.current_market_value,
            "financial_performance_json": valuation.financial_performance_json,
            "trend_reference_json": valuation.trend_reference_json,
            "guidance_check_json": valuation.guidance_check_json,
            "quarter_performance": valuation.quarter_performance,
            "quarter_main_reason": valuation.quarter_main_reason,
            "profit_model_json": valuation.profit_model_json,
            "fcf_model_json": valuation.fcf_model_json,
            "revenue_model_json": valuation.revenue_model_json,
            "primary_model": valuation.primary_model,
            "expected_market_value_3y": valuation.expected_market_value_3y,
            "expectation_gap_rate": valuation.expectation_gap_rate,
            "analysis_date": valuation.analysis_date,
            "researcher": valuation.researcher,
            "created_at": valuation.created_at,
        }
    )
    return row


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
        "status": track.status,
    }


def _stock_material_dict(db: Session, item: "StockMaterial") -> dict:
    material = {
        "id": item.id,
        "stock_id": item.stock_id,
        "material_type": item.material_type,
        "material_id": item.material_id,
        "impact_direction": item.impact_direction,
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
                material_time=source.publish_time.isoformat() if source.publish_time else _isoformat(source.created_at),
            )
    elif item.material_type == "knowledge_note":
        note = db.get(StockResearchNote, item.material_id)
        if note is not None:
            material.update(
                material_title=note.title,
                material_summary=_summary(note.content),
                material_source_name=note.note_type or "knowledge_note",
                material_time=note.updated_at.isoformat() if note.updated_at else _isoformat(note.created_at),
            )
    return material


def _summary(value: str | None, limit: int = 240) -> str | None:
    text = " ".join(str(value or "").split())
    if not text:
        return None
    return text if len(text) <= limit else f"{text[:limit]}..."


def list_stock_materials(db: Session, stock_id: int) -> list[dict]:
    stmt = (
        select(StockMaterial)
        .where(StockMaterial.stock_id == stock_id)
        .order_by(StockMaterial.updated_at.desc(), StockMaterial.id.desc())
    )
    return [_stock_material_dict(db, item) for item in db.scalars(stmt)]


def list_all_stock_materials(db: Session) -> list[dict]:
    stmt = (
        select(StockMaterial)
        .order_by(StockMaterial.updated_at.desc(), StockMaterial.id.desc())
    )
    return [_stock_material_dict(db, item) for item in db.scalars(stmt)]



def create_stock_material(db: Session, stock_id: int, payload: "StockMaterialCreate") -> dict:
    existing = db.scalar(
        select(StockMaterial).where(
            StockMaterial.stock_id == stock_id,
            StockMaterial.material_type == payload.material_type,
            StockMaterial.material_id == payload.material_id,
        )
    )
    if existing is not None:
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return _stock_material_dict(db, existing)

    item = StockMaterial(stock_id=stock_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _stock_material_dict(db, item)


def update_stock_material(db: Session, material_id: int, payload: "StockMaterialUpdate") -> dict | None:
    item = db.get(StockMaterial, material_id)
    if item is None:
        return None
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _stock_material_dict(db, item)


def create_pending_stock_materials_for_source_item(
    db: Session,
    source_item_id: int,
    tag_ids: list[int] | None = None,
) -> int:
    db.flush()
    scoped_tag_ids = set(int(tag_id) for tag_id in tag_ids) if tag_ids is not None else None
    if scoped_tag_ids is not None and not scoped_tag_ids:
        return 0

    source_tag_stmt = select(SourceTag.tag_id).join(Tag, Tag.id == SourceTag.tag_id).where(
        SourceTag.source_item_id == source_item_id,
        Tag.status == "active",
    )
    if scoped_tag_ids is not None:
        source_tag_stmt = source_tag_stmt.where(SourceTag.tag_id.in_(scoped_tag_ids))
    matched_tag_ids = {int(tag_id) for tag_id in db.scalars(source_tag_stmt)}
    if not matched_tag_ids:
        return 0

    stock_ids = {
        int(stock_id)
        for stock_id in db.scalars(
            select(StockTagRelation.stock_id)
            .join(StockPoolItem, StockPoolItem.stock_id == StockTagRelation.stock_id)
            .where(
                StockTagRelation.tag_id.in_(matched_tag_ids),
                StockTagRelation.status == "active",
            )
            .distinct()
        )
    }
    if not stock_ids:
        return 0

    existing_stock_ids = {
        int(stock_id)
        for stock_id in db.scalars(
            select(StockMaterial.stock_id).where(
                StockMaterial.stock_id.in_(stock_ids),
                StockMaterial.material_type == "source_item",
                StockMaterial.material_id == source_item_id,
            )
        )
    }
    inserted = 0
    for stock_id in sorted(stock_ids - existing_stock_ids):
        db.add(
            StockMaterial(
                stock_id=stock_id,
                material_type="source_item",
                material_id=source_item_id,
                status="pending",
            )
        )
        inserted += 1
    if inserted:
        db.flush()
    return inserted

