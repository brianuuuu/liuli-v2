from collections import defaultdict

from sqlalchemy import func, select
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


def get_dashboard(db: Session, selected_stock_id: int | None = None) -> dict:
    pool_rows = db.execute(
        select(StockPoolItem, Stock)
        .join(Stock, Stock.id == StockPoolItem.stock_id)
        .order_by(StockPoolItem.updated_at.desc(), StockPoolItem.id.desc())
    ).all()
    if not pool_rows:
        return {
            "summary": {
                "pool_count": 0,
                "focused_count": 0,
                "pending_materials_count": 0,
                "top_score_stock": None,
            },
            "score_trends": [],
            "valuation_trends": [],
            "score_rankings": [],
            "latest_valuations": [],
            "focus_stocks": [],
            "latest_materials": [],
            "pending_materials": [],
            "default_stock_id": None,
            "selected_stock_summary": None,
        }

    stock_ids = [item.stock_id for item, _stock in pool_rows]
    stock_by_id = {stock.id: stock for _item, stock in pool_rows}
    pool_by_stock_id = {item.stock_id: item for item, _stock in pool_rows}
    tracks_by_stock_id = {stock_id: _active_track_summaries_for_stock(db, stock_id) for stock_id in stock_ids}
    latest_scores = _latest_scores_by_stock(db, stock_ids)
    material_counts = dict(
        db.execute(
            select(StockMaterial.stock_id, func.count(StockMaterial.id))
            .where(StockMaterial.stock_id.in_(stock_ids))
            .group_by(StockMaterial.stock_id)
        ).all()
    )
    pending_materials_count = int(
        db.scalar(
            select(func.count(StockMaterial.id)).where(
                StockMaterial.stock_id.in_(stock_ids),
                StockMaterial.status == "pending",
            )
        )
        or 0
    )

    score_rankings = []
    for item, stock in pool_rows:
        score = latest_scores.get(item.stock_id)
        score_rankings.append(
            {
                "rank": 0,
                "stock_id": item.stock_id,
                "stock_name": stock.stock_name,
                "stock_code": stock.stock_code,
                "status": item.status,
                "tracks": tracks_by_stock_id.get(item.stock_id, []),
                "score_date": score.score_date if score else None,
                "growth_score": score.growth_score if score else None,
                "valuation_score": score.valuation_score if score else None,
                "moat_score": score.moat_score if score else None,
                "risk_score": score.risk_score if score else None,
                "total_score": score.total_score if score else None,
            }
        )
    score_rankings.sort(
        key=lambda row: (
            -(float(row["total_score"]) if row["total_score"] is not None else -1),
            str(row["stock_name"] or ""),
            row["stock_id"],
        )
    )
    for index, row in enumerate(score_rankings, start=1):
        row["rank"] = index

    focus_stocks = []
    for item, stock in pool_rows:
        if item.status != "focused":
            continue
        tracks = tracks_by_stock_id.get(item.stock_id, [])
        focus_stocks.append(
            {
                "stock_id": item.stock_id,
                "stock_name": stock.stock_name,
                "stock_code": stock.stock_code,
                "status": item.status,
                "reason": item.reason,
                "tracks": tracks,
                "latest_score": latest_scores[item.stock_id].total_score if item.stock_id in latest_scores else None,
                "bound_track_count": len(tracks),
                "recent_material_count": int(material_counts.get(item.stock_id, 0)),
            }
        )
    focus_stocks.sort(
        key=lambda row: (
            -(float(row["latest_score"]) if row["latest_score"] is not None else -1),
            -int(row["recent_material_count"]),
            str(row["stock_name"] or ""),
        )
    )

    latest_materials = _dashboard_materials(db, stock_ids, stock_by_id, status=None, limit=10)
    pending_materials = _dashboard_materials(db, stock_ids, stock_by_id, status="pending", limit=10)
    latest_valuations = _latest_valuations(db, stock_ids, stock_by_id)
    top_score = score_rankings[0] if score_rankings and score_rankings[0]["total_score"] is not None else None
    pool_stock_ids = {item.stock_id for item, _stock in pool_rows}
    if selected_stock_id in pool_stock_ids:
        default_stock_id = selected_stock_id
    else:
        default_stock_id = top_score["stock_id"] if top_score else pool_rows[0][0].stock_id
    return {
        "summary": {
            "pool_count": len(pool_rows),
            "focused_count": len([item for item, _stock in pool_rows if item.status == "focused"]),
            "pending_materials_count": pending_materials_count,
            "top_score_stock": {
                "stock_id": top_score["stock_id"],
                "stock_name": top_score["stock_name"],
                "stock_code": top_score["stock_code"],
                "total_score": top_score["total_score"],
            }
            if top_score
            else None,
        },
        "score_trends": _score_trends(db, [row["stock_id"] for row in score_rankings[:8]], stock_by_id),
        "valuation_trends": _valuation_trends(db, [row["stock_id"] for row in latest_valuations[:8]], stock_by_id),
        "score_rankings": score_rankings,
        "latest_valuations": latest_valuations,
        "focus_stocks": focus_stocks[:8],
        "latest_materials": latest_materials,
        "pending_materials": pending_materials,
        "default_stock_id": default_stock_id,
        "selected_stock_summary": _selected_stock_summary(
            db,
            default_stock_id,
            stock_by_id.get(default_stock_id),
            pool_by_stock_id.get(default_stock_id),
            tracks_by_stock_id.get(default_stock_id, []),
            latest_scores.get(default_stock_id),
        ),
    }


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


def _latest_scores_by_stock(db: Session, stock_ids: list[int]) -> dict[int, StockScoreSnapshot]:
    scores = list(
        db.scalars(
            select(StockScoreSnapshot)
            .where(StockScoreSnapshot.stock_id.in_(stock_ids))
            .order_by(
                StockScoreSnapshot.stock_id.asc(),
                StockScoreSnapshot.score_date.desc(),
                StockScoreSnapshot.id.desc(),
            )
        )
    )
    latest: dict[int, StockScoreSnapshot] = {}
    for score in scores:
        if score.stock_id not in latest:
            latest[score.stock_id] = score
    return latest


def _score_point(score: StockScoreSnapshot | None) -> dict | None:
    if score is None:
        return None
    return {
        "score_date": score.score_date,
        "total_score": score.total_score,
        "growth_score": score.growth_score,
        "valuation_score": score.valuation_score,
        "moat_score": score.moat_score,
        "risk_score": score.risk_score,
    }


def _score_trends(db: Session, stock_ids: list[int], stock_by_id: dict[int, Stock]) -> list[dict]:
    if not stock_ids:
        return []
    rows = list(
        db.scalars(
            select(StockScoreSnapshot)
            .where(StockScoreSnapshot.stock_id.in_(stock_ids))
            .order_by(StockScoreSnapshot.stock_id.asc(), StockScoreSnapshot.score_date.asc(), StockScoreSnapshot.id.asc())
        )
    )
    points_by_stock: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        point = _score_point(row)
        if point is not None:
            points_by_stock[row.stock_id].append(point)
    trends = []
    for stock_id in stock_ids:
        stock = stock_by_id.get(stock_id)
        trends.append(
            {
                "stock_id": stock_id,
                "stock_name": stock.stock_name if stock else None,
                "stock_code": stock.stock_code if stock else None,
                "points": points_by_stock.get(stock_id, []),
            }
        )
    return trends


def _dashboard_materials(
    db: Session,
    stock_ids: list[int],
    stock_by_id: dict[int, Stock],
    status: str | None,
    limit: int,
) -> list[dict]:
    stmt = select(StockMaterial).where(StockMaterial.stock_id.in_(stock_ids))
    if status is not None:
        stmt = stmt.where(StockMaterial.status == status)
    materials = sorted(
        db.scalars(stmt),
        key=lambda item: (
            0 if item.status == "pending" else 1,
            -(item.updated_at.timestamp() if item.updated_at else 0),
            -item.id,
        ),
    )
    rows = []
    for item in materials[:limit]:
        row = _stock_material_dict(db, item)
        stock = stock_by_id.get(item.stock_id)
        row["stock_name"] = stock.stock_name if stock else None
        row["stock_code"] = stock.stock_code if stock else None
        rows.append(row)
    return rows


def _latest_valuation(db: Session, stock_id: int) -> dict | None:
    item = db.scalar(
        select(StockValuationSnapshot)
        .where(StockValuationSnapshot.stock_id == stock_id)
        .order_by(StockValuationSnapshot.analysis_date.desc(), StockValuationSnapshot.id.desc())
    )
    if item is None:
        return None
    return {
        "report_period": item.report_period,
        "current_market_value": item.current_market_value,
        "quarter_performance": item.quarter_performance,
        "primary_model": item.primary_model,
        "expected_market_value_3y": item.expected_market_value_3y,
        "expectation_gap_rate": item.expectation_gap_rate,
        "analysis_date": item.analysis_date,
        "researcher": item.researcher,
    }


def _valuation_point(item: StockValuationSnapshot) -> dict:
    return {
        "analysis_date": item.analysis_date,
        "report_period": item.report_period,
        "current_market_value": item.current_market_value,
        "expected_market_value_3y": item.expected_market_value_3y,
        "expectation_gap_rate": item.expectation_gap_rate,
    }


def _valuation_row(item: StockValuationSnapshot, stock: Stock | None) -> dict:
    return {
        "stock_id": item.stock_id,
        "stock_name": stock.stock_name if stock else None,
        "stock_code": stock.stock_code if stock else None,
        "report_period": item.report_period,
        "current_market_value": item.current_market_value,
        "quarter_performance": item.quarter_performance,
        "primary_model": item.primary_model,
        "expected_market_value_3y": item.expected_market_value_3y,
        "expectation_gap_rate": item.expectation_gap_rate,
        "analysis_date": item.analysis_date,
        "researcher": item.researcher,
    }


def _latest_valuations(db: Session, stock_ids: list[int], stock_by_id: dict[int, Stock]) -> list[dict]:
    if not stock_ids:
        return []
    rows = list(
        db.scalars(
            select(StockValuationSnapshot)
            .where(StockValuationSnapshot.stock_id.in_(stock_ids))
            .order_by(
                StockValuationSnapshot.stock_id.asc(),
                StockValuationSnapshot.analysis_date.desc(),
                StockValuationSnapshot.id.desc(),
            )
        )
    )
    latest: dict[int, StockValuationSnapshot] = {}
    for row in rows:
        if row.stock_id not in latest:
            latest[row.stock_id] = row
    result = [_valuation_row(item, stock_by_id.get(stock_id)) for stock_id, item in latest.items()]
    result.sort(
        key=lambda row: (
            -(float(row["expectation_gap_rate"]) if row["expectation_gap_rate"] is not None else -999),
            str(row["stock_name"] or ""),
            row["stock_id"],
        )
    )
    return result[:10]


def _valuation_trends(db: Session, stock_ids: list[int], stock_by_id: dict[int, Stock]) -> list[dict]:
    if not stock_ids:
        return []
    rows = list(
        db.scalars(
            select(StockValuationSnapshot)
            .where(StockValuationSnapshot.stock_id.in_(stock_ids), StockValuationSnapshot.analysis_date.is_not(None))
            .order_by(StockValuationSnapshot.stock_id.asc(), StockValuationSnapshot.analysis_date.asc(), StockValuationSnapshot.id.asc())
        )
    )
    points_by_stock: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        points_by_stock[row.stock_id].append(_valuation_point(row))
    trends = []
    for stock_id in stock_ids:
        stock = stock_by_id.get(stock_id)
        trends.append(
            {
                "stock_id": stock_id,
                "stock_name": stock.stock_name if stock else None,
                "stock_code": stock.stock_code if stock else None,
                "points": points_by_stock.get(stock_id, []),
            }
        )
    return trends


def _latest_note(db: Session, stock_id: int) -> dict | None:
    item = db.scalar(
        select(StockResearchNote)
        .where(StockResearchNote.stock_id == stock_id)
        .order_by(StockResearchNote.updated_at.desc(), StockResearchNote.id.desc())
    )
    if item is None:
        return None
    return {
        "id": item.id,
        "note_type": item.note_type,
        "title": item.title,
        "content": _summary(item.content, limit=180) or "",
        "related_track_id": item.related_track_id,
        "updated_at": item.updated_at,
    }


def _selected_stock_summary(
    db: Session,
    stock_id: int | None,
    stock: Stock | None,
    pool_item: StockPoolItem | None,
    tracks: list[dict],
    latest_score: StockScoreSnapshot | None,
) -> dict | None:
    if stock_id is None:
        return None
    return {
        "stock_id": stock_id,
        "stock_name": stock.stock_name if stock else None,
        "stock_code": stock.stock_code if stock else None,
        "status": pool_item.status if pool_item else None,
        "reason": pool_item.reason if pool_item else None,
        "tracks": tracks,
        "latest_score": _score_point(latest_score),
        "latest_valuation": _latest_valuation(db, stock_id),
        "latest_note": _latest_note(db, stock_id),
        "recent_materials": _dashboard_materials(db, [stock_id], {stock_id: stock} if stock else {}, status=None, limit=10),
    }


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
