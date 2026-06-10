from collections import defaultdict
from datetime import date, datetime, timedelta
import math

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.job_center.types import JobResult
from invest_assistant.modules.basic.stock_master.service import ensure_stock_tag
from invest_assistant.modules.market_radar.models import SourceItem, SourceTag, Tag, StockTagRelation
from invest_assistant.modules.stock_analysis.models import (
    StockCompareGroup,
    StockDailyBar,
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
from invest_assistant.services.tushare import client as tushare_client
from invest_assistant.shared.pagination import Page, make_page, normalize_limit, normalize_offset


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
            "hot_stocks": [],
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
    hot_stocks = _hot_stocks(db, stock_ids, stock_by_id, pool_by_stock_id)
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
        "hot_stocks": hot_stocks,
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


def get_stock_detail(db: Session, stock_id: int) -> dict | None:
    stock = db.get(Stock, stock_id)
    if stock is None:
        return None

    pool_item = db.scalar(select(StockPoolItem).where(StockPoolItem.stock_id == stock_id))
    score_history = list(
        db.scalars(
            select(StockScoreSnapshot)
            .where(StockScoreSnapshot.stock_id == stock_id)
            .order_by(StockScoreSnapshot.score_date.asc(), StockScoreSnapshot.id.asc())
        )
    )
    valuation_history = list(
        db.scalars(
            select(StockValuationSnapshot)
            .where(StockValuationSnapshot.stock_id == stock_id)
            .order_by(
                StockValuationSnapshot.analysis_date.asc().nullsfirst(),
                StockValuationSnapshot.id.asc(),
            )
        )
    )
    materials = list_stock_materials(db, stock_id)
    disclosures = [_disclosure_dict(item) for item in _stock_disclosures(db, stock_id, materials)]
    tracks = list_track_relations(db, stock_id)
    notes = list_notes(db, stock_id)
    note_rows = [_note_dict(item) for item in notes]
    tags = _stock_tag_bindings(db, stock_id)
    last_updated_candidates = [
        stock.updated_at,
        pool_item.updated_at if pool_item else None,
        *(item.updated_at for item in notes),
        *(item.get("updated_at") for item in materials),
    ]
    return {
        "stock": _stock_dict(stock),
        "pool": _pool_item_dict_from_stock(db, pool_item, stock) if pool_item else None,
        "summary": {
            "track_count": len([item for item in tracks if item.get("status") == "active"]),
            "material_count": len(materials),
            "high_importance_material_count": len([item for item in materials if item.get("importance_level") == "high"]),
            "note_count": len(notes),
            "last_updated_at": _max_datetime(last_updated_candidates),
        },
        "latest_score": _score_snapshot_dict(score_history[-1]) if score_history else None,
        "score_history": [_score_snapshot_dict(item) for item in score_history],
        "latest_valuation": _valuation_snapshot_dict(valuation_history[-1]) if valuation_history else None,
        "valuation_history": [_valuation_snapshot_dict(item) for item in valuation_history],
        "materials": materials,
        "disclosures": disclosures,
        "tracks": tracks,
        "notes": note_rows,
        "tags": tags,
    }


def _stock_dict(stock: Stock) -> dict:
    return {
        "id": stock.id,
        "symbol": stock.symbol,
        "stock_code": stock.stock_code,
        "stock_name": stock.stock_name,
        "market": stock.market,
        "exchange": stock.exchange,
        "status": stock.status,
        "created_at": stock.created_at,
        "updated_at": stock.updated_at,
    }


def _score_snapshot_dict(item: StockScoreSnapshot) -> dict:
    return {
        "id": item.id,
        "stock_id": item.stock_id,
        "score_date": item.score_date,
        "track_id": item.track_id,
        "growth_score": item.growth_score,
        "valuation_score": item.valuation_score,
        "moat_score": item.moat_score,
        "risk_score": item.risk_score,
        "total_score": item.total_score,
        "created_at": item.created_at,
    }


def _valuation_snapshot_dict(item: StockValuationSnapshot) -> dict:
    return {
        "id": item.id,
        "stock_id": item.stock_id,
        "company": item.company,
        "company_code": item.company_code,
        "report_period": item.report_period,
        "report_release_date": item.report_release_date,
        "current_market_value": item.current_market_value,
        "financial_performance_json": item.financial_performance_json,
        "trend_reference_json": item.trend_reference_json,
        "guidance_check_json": item.guidance_check_json,
        "quarter_performance": item.quarter_performance,
        "quarter_main_reason": item.quarter_main_reason,
        "profit_model_json": item.profit_model_json,
        "fcf_model_json": item.fcf_model_json,
        "revenue_model_json": item.revenue_model_json,
        "primary_model": item.primary_model,
        "expected_market_value_3y": item.expected_market_value_3y,
        "expectation_gap_rate": item.expectation_gap_rate,
        "analysis_date": item.analysis_date,
        "researcher": item.researcher,
        "created_at": item.created_at,
    }


def _note_dict(item: StockResearchNote) -> dict:
    return {
        "id": item.id,
        "stock_id": item.stock_id,
        "note_type": item.note_type,
        "title": item.title,
        "content": item.content,
        "related_track_id": item.related_track_id,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _stock_tag_bindings(db: Session, stock_id: int) -> list[dict]:
    rows = db.execute(
        select(StockTagRelation, Tag)
        .join(Tag, Tag.id == StockTagRelation.tag_id)
        .where(StockTagRelation.stock_id == stock_id)
        .order_by(Tag.name.asc())
    ).all()
    return [
        {
            "id": relation.id,
            "tag": {
                "id": tag.id,
                "name": tag.name,
                "type": tag.type,
                "source": tag.source,
                "status": tag.status,
                "created_at": tag.created_at,
                "updated_at": tag.updated_at,
            },
            "source": relation.source,
            "status": relation.status,
            "created_at": relation.created_at,
            "updated_at": relation.updated_at,
        }
        for relation, tag in rows
    ]


def _stock_disclosures(db: Session, stock_id: int, materials: list[dict]) -> list[CompanyDisclosure]:
    disclosure_ids = [
        int(item["material_id"])
        for item in materials
        if item.get("material_type") == "company_disclosure" and item.get("material_id") is not None
    ]
    conditions = [CompanyDisclosure.stock_id == stock_id]
    if disclosure_ids:
        conditions.append(CompanyDisclosure.id.in_(disclosure_ids))
    rows = list(db.scalars(select(CompanyDisclosure).where(or_(*conditions))))
    deduped = {row.id: row for row in rows}
    return sorted(
        deduped.values(),
        key=lambda item: (
            item.publish_time or item.created_at,
            item.id,
        ),
        reverse=True,
    )


def _disclosure_dict(item: CompanyDisclosure) -> dict:
    return {
        "id": item.id,
        "stock_id": item.stock_id,
        "source": item.source,
        "disclosure_type": item.disclosure_type,
        "title": item.title,
        "publish_time": item.publish_time,
        "report_period": item.report_period,
        "source_url": item.source_url,
        "file_path": item.file_path,
        "parsed_text_path": item.parsed_text_path,
        "parsed_markdown_path": item.parsed_markdown_path,
        "parse_status": item.parse_status,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _max_datetime(values) -> object | None:
    items = [item for item in values if item is not None]
    if not items:
        return None
    return max(items, key=lambda item: item.timestamp())


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
    materials = list(
        db.scalars(
            stmt.order_by(
                case((StockMaterial.status == "pending", 0), else_=1),
                StockMaterial.updated_at.desc(),
                StockMaterial.id.desc(),
            ).limit(limit)
        )
    )
    rows = []
    for item in materials:
        row = _stock_material_dict(db, item)
        stock = stock_by_id.get(item.stock_id)
        row["stock_name"] = stock.stock_name if stock else None
        row["stock_code"] = stock.stock_code if stock else None
        rows.append(row)
    return rows


def _hot_stocks(
    db: Session,
    stock_ids: list[int],
    stock_by_id: dict[int, Stock],
    pool_by_stock_id: dict[int, StockPoolItem],
    limit: int = 10,
) -> list[dict]:
    if not stock_ids:
        return []
    rows = db.execute(
        select(
            StockMaterial.stock_id,
            func.sum(case((StockMaterial.material_type == "source_item", 1), else_=0)).label("source_item_count"),
            func.count(StockMaterial.id).label("material_count"),
            func.sum(case((StockMaterial.importance_level == "high", 1), else_=0)).label("high_importance_material_count"),
            func.max(StockMaterial.updated_at).label("latest_material_time"),
        )
        .where(StockMaterial.stock_id.in_(stock_ids))
        .group_by(StockMaterial.stock_id)
    ).all()
    stats = {
        int(stock_id): {
            "source_item_count": int(source_item_count or 0),
            "material_count": int(material_count or 0),
            "high_importance_material_count": int(high_importance_material_count or 0),
            "latest_material_time": latest_material_time,
        }
        for stock_id, source_item_count, material_count, high_importance_material_count, latest_material_time in rows
    }

    result = []
    for stock_id, stat in stats.items():
        stock = stock_by_id.get(stock_id)
        pool_item = pool_by_stock_id.get(stock_id)
        result.append(
            {
                "rank": 0,
                "stock_id": stock_id,
                "stock_name": stock.stock_name if stock else None,
                "stock_code": stock.stock_code if stock else None,
                "status": pool_item.status if pool_item else None,
                "source_item_count": int(stat["source_item_count"]),
                "material_count": int(stat["material_count"]),
                "high_importance_material_count": int(stat["high_importance_material_count"]),
                "latest_material_time": stat["latest_material_time"],
            }
        )
    result.sort(
        key=lambda row: (
            -row["source_item_count"],
            -row["high_importance_material_count"],
            -row["material_count"],
            -(row["latest_material_time"].timestamp() if row["latest_material_time"] else 0),
            str(row["stock_name"] or ""),
            row["stock_id"],
        )
    )
    for index, row in enumerate(result[:limit], start=1):
        row["rank"] = index
    return result[:limit]


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
            -(row["analysis_date"].toordinal() if row["analysis_date"] is not None else 0),
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
        "disclosure_type": None,
        "report_period": None,
        "parse_status": None,
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
    elif item.material_type == "company_disclosure":
        disclosure = db.get(CompanyDisclosure, item.material_id)
        if disclosure is not None:
            material.update(
                material_title=disclosure.title,
                material_summary=disclosure.title,
                material_source_name=disclosure.source,
                material_url=disclosure.source_url,
                material_time=disclosure.publish_time.isoformat()
                if disclosure.publish_time
                else _isoformat(disclosure.created_at),
                disclosure_type=disclosure.disclosure_type,
                report_period=disclosure.report_period,
                parse_status=disclosure.parse_status,
            )
    return material


def _summary(value: str | None, limit: int = 240) -> str | None:
    text = " ".join(str(value or "").split())
    if not text:
        return None
    return text if len(text) <= limit else f"{text[:limit]}..."


def _isoformat(value: object) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


def list_stock_materials(db: Session, stock_id: int) -> list[dict]:
    stmt = (
        select(StockMaterial)
        .where(StockMaterial.stock_id == stock_id)
        .order_by(StockMaterial.updated_at.desc(), StockMaterial.id.desc())
    )
    return [_stock_material_dict(db, item) for item in db.scalars(stmt)]


def _stock_materials_page(
    db: Session,
    *,
    stock_id: int | None = None,
    statuses: list[str] | None = None,
    limit: int | None = 50,
    offset: int = 0,
) -> Page[dict]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    stmt = select(StockMaterial).order_by(StockMaterial.updated_at.desc(), StockMaterial.id.desc())
    count_stmt = select(func.count(StockMaterial.id))
    if stock_id is not None:
        stmt = stmt.where(StockMaterial.stock_id == stock_id)
        count_stmt = count_stmt.where(StockMaterial.stock_id == stock_id)
    if statuses:
        stmt = stmt.where(StockMaterial.status.in_(statuses))
        count_stmt = count_stmt.where(StockMaterial.status.in_(statuses))
    total = int(db.scalar(count_stmt) or 0)
    items = list(db.scalars(stmt.limit(safe_limit).offset(safe_offset)))
    return make_page([_stock_material_dict(db, item) for item in items], total, safe_limit, safe_offset)


def list_stock_materials_page(
    db: Session,
    stock_id: int,
    statuses: list[str] | None = None,
    limit: int | None = 50,
    offset: int = 0,
) -> Page[dict]:
    return _stock_materials_page(db, stock_id=stock_id, statuses=statuses, limit=limit, offset=offset)


def list_all_stock_materials(db: Session) -> list[dict]:
    stmt = (
        select(StockMaterial)
        .order_by(StockMaterial.updated_at.desc(), StockMaterial.id.desc())
    )
    return [_stock_material_dict(db, item) for item in db.scalars(stmt)]


def list_all_stock_materials_page(
    db: Session,
    statuses: list[str] | None = None,
    stock_id: int | None = None,
    limit: int | None = 50,
    offset: int = 0,
) -> Page[dict]:
    return _stock_materials_page(db, stock_id=stock_id, statuses=statuses, limit=limit, offset=offset)


def list_stock_daily_bars(
    db: Session,
    stock_id: int,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    refresh: bool = False,
    years: int = 3,
    adj: str = "qfq",
) -> list[StockDailyBar] | None:
    stock = db.get(Stock, stock_id)
    if stock is None:
        return None

    cache_count_stmt = select(func.count(StockDailyBar.id)).where(
        StockDailyBar.stock_id == stock_id,
        StockDailyBar.adj == adj,
        StockDailyBar.source == "tushare",
    )
    if start_date is not None:
        cache_count_stmt = cache_count_stmt.where(StockDailyBar.trade_date >= start_date)
    if end_date is not None:
        cache_count_stmt = cache_count_stmt.where(StockDailyBar.trade_date <= end_date)
    has_cached_rows = db.scalar(cache_count_stmt)
    if refresh or not has_cached_rows:
        refresh_stock_daily_bars(
            db,
            stock,
            years=years,
            adj=adj,
            start_date=start_date,
            end_date=end_date,
            force_refresh=refresh,
        )

    stmt = select(StockDailyBar).where(
        StockDailyBar.stock_id == stock_id,
        StockDailyBar.adj == adj,
        StockDailyBar.source == "tushare",
    )
    if start_date is not None:
        stmt = stmt.where(StockDailyBar.trade_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(StockDailyBar.trade_date <= end_date)
    return list(db.scalars(stmt.order_by(StockDailyBar.trade_date.asc(), StockDailyBar.id.asc())))


def refresh_stock_daily_bars(
    db: Session,
    stock: Stock,
    *,
    years: int = 3,
    adj: str = "qfq",
    start_date: date | None = None,
    end_date: date | None = None,
    force_refresh: bool = False,
) -> JobResult:
    end = end_date or date.today()
    start = start_date or end - timedelta(days=max(int(years), 1) * 366)
    ts_code = _stock_ts_code(stock)
    rows = tushare_client.fetch_a_stock_daily_bar_rows(
        ts_code,
        start_date=start.strftime("%Y%m%d"),
        end_date=end.strftime("%Y%m%d"),
        adj=adj,
        ma=[5, 20, 60, 250],
    )
    normalized = _normalize_daily_bar_rows(rows, ts_code=ts_code)
    if not normalized:
        return JobResult(success=True, message=f"no daily bars fetched for {ts_code}", skipped_count=1)

    _fill_missing_moving_averages(normalized)
    existing = {
        item.trade_date: item
        for item in db.scalars(
            select(StockDailyBar).where(
                StockDailyBar.stock_id == stock.id,
                StockDailyBar.trade_date.in_([row["trade_date"] for row in normalized]),
                StockDailyBar.adj == adj,
                StockDailyBar.source == "tushare",
            )
        )
    }

    inserted = 0
    updated = 0
    for row in normalized:
        payload = {
            "stock_id": stock.id,
            "ts_code": ts_code,
            "trade_date": row["trade_date"],
            "open": row["open"],
            "high": row["high"],
            "low": row["low"],
            "close": row["close"],
            "pre_close": row.get("pre_close"),
            "change": row.get("change"),
            "pct_chg": row.get("pct_chg"),
            "vol": row.get("vol"),
            "amount": row.get("amount"),
            "ma5": row.get("ma5"),
            "ma20": row.get("ma20"),
            "ma60": row.get("ma60"),
            "ma250": row.get("ma250"),
            "source": "tushare",
            "adj": adj,
        }
        item = existing.get(row["trade_date"])
        if item is None:
            db.add(StockDailyBar(**payload))
            inserted += 1
        else:
            for key, value in payload.items():
                setattr(item, key, value)
            updated += 1

    db.commit()
    return JobResult(
        success=True,
        message=f"synced {len(normalized)} daily bars for {ts_code}",
        fetched_count=len(normalized),
        processed_count=1,
        inserted_count=inserted,
        updated_count=updated,
        extra={"ts_code": ts_code, "adj": adj, "force_refresh": force_refresh},
    )


def sync_daily_bars(
    db: Session,
    *,
    stock_code: str | None = None,
    pool_status: str = "focused,watching,candidate",
    years: int = 3,
    adj: str = "qfq",
    force_refresh: bool = False,
    max_stocks: int = 200,
) -> JobResult:
    stocks = _daily_bar_target_stocks(
        db,
        stock_code=stock_code,
        pool_status=pool_status,
        max_stocks=max_stocks,
    )
    if not stocks:
        return JobResult(success=True, message="no target stocks", skipped_count=1, extra={"per_stock": []})

    processed = 0
    fetched = 0
    inserted = 0
    updated = 0
    skipped = 0
    per_stock: list[dict] = []
    for stock in stocks:
        processed += 1
        ts_code = _stock_ts_code(stock)
        try:
            result = refresh_stock_daily_bars(
                db,
                stock,
                years=years,
                adj=adj,
                force_refresh=force_refresh,
            )
        except Exception as exc:
            db.rollback()
            skipped += 1
            per_stock.append(
                {
                    "stock_id": stock.id,
                    "stock_code": stock.stock_code,
                    "stock_name": stock.stock_name,
                    "ts_code": ts_code,
                    "status": "failed",
                    "error": str(exc),
                }
            )
            continue

        fetched += result.fetched_count
        inserted += result.inserted_count
        updated += result.updated_count
        skipped += result.skipped_count
        per_stock.append(
            {
                "stock_id": stock.id,
                "stock_code": stock.stock_code,
                "stock_name": stock.stock_name,
                "ts_code": ts_code,
                "status": "success" if getattr(result, "success", True) else "skipped",
                "fetched": result.fetched_count,
                "inserted": result.inserted_count,
                "updated": result.updated_count,
                "skipped": result.skipped_count,
                "message": getattr(result, "message", ""),
            }
        )

    return JobResult(
        success=True,
        message=f"synced daily bars for {processed} stocks",
        fetched_count=fetched,
        processed_count=processed,
        inserted_count=inserted,
        updated_count=updated,
        skipped_count=skipped,
        extra={"per_stock": per_stock, "adj": adj, "years": years},
    )


def _daily_bar_target_stocks(
    db: Session,
    *,
    stock_code: str | None,
    pool_status: str,
    max_stocks: int,
) -> list[Stock]:
    if stock_code:
        code = stock_code.strip().upper()
        if "." in code:
            bare_code = code.split(".", 1)[0]
            return list(db.scalars(select(Stock).where(or_(Stock.symbol == code, Stock.stock_code == bare_code)).limit(1)))
        return list(db.scalars(select(Stock).where(Stock.stock_code == code).limit(1)))

    statuses = [item.strip() for item in str(pool_status or "").split(",") if item.strip()]
    stmt = (
        select(Stock)
        .join(StockPoolItem, StockPoolItem.stock_id == Stock.id)
        .where(Stock.status != "archived")
        .order_by(StockPoolItem.updated_at.desc(), StockPoolItem.id.desc())
        .limit(max(int(max_stocks or 200), 1))
    )
    if statuses:
        stmt = stmt.where(StockPoolItem.status.in_(statuses))
    return list(db.scalars(stmt))


def _stock_ts_code(stock: Stock) -> str:
    symbol = (stock.symbol or "").strip().upper()
    if "." in symbol:
        return symbol

    stock_code = (stock.stock_code or symbol).strip()
    exchange = (stock.exchange or "").strip().upper()
    suffix_map = {
        "SSE": "SH",
        "SH": "SH",
        "SHSE": "SH",
        "XSHG": "SH",
        "SZSE": "SZ",
        "SZ": "SZ",
        "XSHE": "SZ",
        "BSE": "BJ",
        "BJ": "BJ",
        "BJS": "BJ",
        "XBSE": "BJ",
    }
    suffix = suffix_map.get(exchange)
    if suffix is None:
        if stock_code.startswith(("6", "9")):
            suffix = "SH"
        elif stock_code.startswith(("4", "8")):
            suffix = "BJ"
        else:
            suffix = "SZ"
    return f"{stock_code}.{suffix}".upper()


def _normalize_daily_bar_rows(rows: list[dict], *, ts_code: str) -> list[dict]:
    normalized: list[dict] = []
    for row in rows:
        trade_date = _parse_trade_date(row.get("trade_date"))
        if trade_date is None:
            continue
        open_price = _float_or_none(row.get("open"))
        high_price = _float_or_none(row.get("high"))
        low_price = _float_or_none(row.get("low"))
        close_price = _float_or_none(row.get("close"))
        if None in (open_price, high_price, low_price, close_price):
            continue
        normalized.append(
            {
                "ts_code": row.get("ts_code") or ts_code,
                "trade_date": trade_date,
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "pre_close": _float_or_none(row.get("pre_close")),
                "change": _float_or_none(row.get("change")),
                "pct_chg": _float_or_none(row.get("pct_chg")),
                "vol": _float_or_none(row.get("vol")),
                "amount": _float_or_none(row.get("amount")),
                "ma5": _float_or_none(row.get("ma5") or row.get("ma_5")),
                "ma20": _float_or_none(row.get("ma20") or row.get("ma_20")),
                "ma60": _float_or_none(row.get("ma60") or row.get("ma_60")),
                "ma250": _float_or_none(row.get("ma250") or row.get("ma_250")),
            }
        )
    normalized.sort(key=lambda item: item["trade_date"])
    return normalized


def _fill_missing_moving_averages(rows: list[dict]) -> None:
    closes: list[float] = []
    for row in rows:
        closes.append(float(row["close"]))
        for window in (5, 20, 60, 250):
            key = f"ma{window}"
            if row.get(key) is not None or len(closes) < window:
                continue
            row[key] = round(sum(closes[-window:]) / window, 6)


def _parse_trade_date(value) -> date | None:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:10] if fmt == "%Y-%m-%d" else text, fmt).date()
        except ValueError:
            continue
    return None


def _float_or_none(value) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed



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
