from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from invest_assistant.modules.knowledge_base.models import KnowledgeNote
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial
from invest_assistant.services.deepseek import client as deepseek_client

VALID_DECISIONS = {"confirmed", "ignored"}
VALID_DIRECTIONS = {"support", "weaken", "neutral", "noise"}
VALID_IMPORTANCE_LEVELS = {"high", "medium", "low"}


def _clean_text(value: Any, limit: int = 1000) -> str | None:
    text = " ".join(str(value or "").split())
    if not text:
        return None
    return text if len(text) <= limit else f"{text[:limit]}..."


def _isoformat(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _material_reference(db: Session, item: TrackMaterial) -> dict[str, Any]:
    reference: dict[str, Any] = {
        "title": None,
        "summary": None,
        "source_name": None,
        "source_url": None,
        "event_time": None,
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
        note = db.get(KnowledgeNote, item.material_id)
        if note is not None:
            reference.update(
                title=note.title,
                summary=_clean_text(note.content),
                source_name=note.note_type or "knowledge_note",
                event_time=_isoformat(note.updated_at or note.created_at),
            )
    return reference


def build_track_material_payload(db: Session, item: TrackMaterial) -> dict[str, Any]:
    track = db.get(Track, item.track_id)
    reference = _material_reference(db, item)
    return {
        "track_material_id": item.id,
        "track_id": item.track_id,
        "track_name": track.name if track else None,
        "track_description": track.description if track else None,
        "material_type": item.material_type,
        "material_id": item.material_id,
        "current_direction": item.direction,
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
        material_id = _normalize_id(raw.get("track_material_id") or raw.get("id"))
        if material_id is None or material_id not in valid_material_ids or material_id in decisions:
            continue
        decision = _normalize_choice(raw.get("decision"), VALID_DECISIONS, "")
        if decision == "confirmed":
            decisions[material_id] = {
                "status": "confirmed",
                "direction": _normalize_choice(raw.get("direction"), VALID_DIRECTIONS, "neutral"),
                "importance_level": _normalize_choice(raw.get("importance_level"), VALID_IMPORTANCE_LEVELS, "medium"),
                "note": _normalize_note(raw.get("note") or raw.get("reason"), "AI确认适合作为赛道长期分析素材。"),
            }
        elif decision == "ignored":
            decisions[material_id] = {
                "status": "ignored",
                "direction": "noise",
                "importance_level": "low",
                "note": _normalize_note(raw.get("reason") or raw.get("note"), "AI判断不适合作为赛道长期分析素材。"),
            }
    return decisions


def review_track_materials(db: Session, materials: list[TrackMaterial], prompt, model: str, deepseek=deepseek_client) -> dict:
    payloads = [build_track_material_payload(db, item) for item in materials]
    response = deepseek.review_track_materials(payloads, prompt, model)
    valid_ids = {item.id for item in materials}
    return {
        "payloads": payloads,
        "decisions": normalize_review_decisions(response, valid_ids),
        "usage": response.get("usage") or {},
    }
