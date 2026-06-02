from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.stock_analysis.models import StockMaterial, StockResearchNote
from invest_assistant.services.deepseek import client as deepseek_client

VALID_DECISIONS = {"confirmed", "ignored"}
VALID_DIRECTIONS = {"positive", "negative", "neutral", "noise"}
VALID_IMPORTANCE_LEVELS = {"high", "medium", "low"}


def _clean_text(value: Any, limit: int = 1000) -> str | None:
    text = " ".join(str(value or "").split())
    if not text:
        return None
    return text if len(text) <= limit else f"{text[:limit]}..."


def _isoformat(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _material_reference(db: Session, item: StockMaterial) -> dict[str, Any]:
    reference: dict[str, Any] = {
        "title": None,
        "summary": None,
        "source_name": None,
        "source_url": None,
        "event_time": None,
        "disclosure_type": None,
        "report_period": None,
    }
    if item.material_type == "source_item":
        source = db.get(SourceItem, item.material_id)
        if source is not None:
            reference.update(
                title=source.title,
                summary=_clean_text(source.content),
                source_name=source.source_name,
                source_url=source.source_url,
                event_time=_isoformat(source.publish_time or source.created_at),
            )
    elif item.material_type == "knowledge_note":
        note = db.get(StockResearchNote, item.material_id)
        if note is not None:
            reference.update(
                title=note.title,
                summary=_clean_text(note.content),
                source_name=note.note_type or "knowledge_note",
                event_time=_isoformat(note.updated_at or note.created_at),
            )
    elif item.material_type == "company_disclosure":
        disclosure = db.get(CompanyDisclosure, item.material_id)
        if disclosure is not None:
            reference.update(
                title=disclosure.title,
                summary=disclosure.title,
                source_name=disclosure.source,
                source_url=disclosure.source_url,
                event_time=_isoformat(disclosure.publish_time or disclosure.created_at),
                disclosure_type=disclosure.disclosure_type,
                report_period=disclosure.report_period,
            )
    return reference


def build_stock_material_payload(db: Session, item: StockMaterial) -> dict[str, Any]:
    stock = db.get(Stock, item.stock_id)
    reference = _material_reference(db, item)
    return {
        "stock_material_id": item.id,
        "stock_id": item.stock_id,
        "stock_code": stock.stock_code if stock else None,
        "stock_name": stock.stock_name if stock else None,
        "material_type": item.material_type,
        "material_id": item.material_id,
        "current_impact_direction": item.impact_direction,
        "current_importance_level": item.importance_level,
        "current_note": item.note,
        **reference,
    }


def _normalize_id(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_choice(value: Any, valid_values: set[str], default: str) -> str:
    text = str(value or "").strip().lower()
    return text if text in valid_values else default


def _normalize_note(value: Any, fallback: str) -> str:
    return _clean_text(value, limit=240) or fallback


def normalize_review_decisions(response: dict[str, Any], valid_material_ids: set[int]) -> dict[int, dict[str, str]]:
    decisions: dict[int, dict[str, str]] = {}
    for raw in response.get("reviews") or []:
        if not isinstance(raw, dict):
            continue
        material_id = _normalize_id(raw.get("stock_material_id") or raw.get("id"))
        if material_id is None or material_id not in valid_material_ids or material_id in decisions:
            continue
        decision = _normalize_choice(raw.get("decision"), VALID_DECISIONS, "")
        if decision == "confirmed":
            decisions[material_id] = {
                "status": "confirmed",
                "impact_direction": _normalize_choice(raw.get("impact_direction"), VALID_DIRECTIONS, "neutral"),
                "importance_level": _normalize_choice(raw.get("importance_level"), VALID_IMPORTANCE_LEVELS, "medium"),
                "note": _normalize_note(raw.get("note") or raw.get("reason"), "AI确认适合作为长期分析素材。"),
            }
        elif decision == "ignored":
            decisions[material_id] = {
                "status": "ignored",
                "impact_direction": "noise",
                "importance_level": "low",
                "note": _normalize_note(raw.get("reason") or raw.get("note"), "AI判断不适合作为长期分析素材。"),
            }
    return decisions


def review_stock_materials(db: Session, materials: list[StockMaterial], prompt, model: str, deepseek=deepseek_client) -> dict:
    payloads = [build_stock_material_payload(db, item) for item in materials]
    response = deepseek.review_stock_materials(payloads, prompt, model)
    valid_ids = {item.id for item in materials}
    return {
        "payloads": payloads,
        "decisions": normalize_review_decisions(response, valid_ids),
        "usage": response.get("usage") or {},
    }
