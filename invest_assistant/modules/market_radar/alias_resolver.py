from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import StockTagRelation
from invest_assistant.modules.market_radar.models import HotwordTagRelation, SourceItem, Tag
from invest_assistant.modules.track_discovery.models import TrackTagRelation


@dataclass(frozen=True)
class SourceTagMatch:
    tag_id: int
    trigger_text: str
    extractor: str


def _source_text(item: SourceItem) -> str:
    return f"{item.title}\n{item.content}".casefold()


def _contains(text: str, value: str | None) -> bool:
    token = str(value or "").strip()
    return bool(token) and token.casefold() in text


def resolve_source_tag_matches(db: Session, item: SourceItem, tag_type: str | None = None, tag_id: int | None = None) -> list[SourceTagMatch]:
    text = _source_text(item)
    matches: dict[int, SourceTagMatch] = {}

    tag_stmt = select(Tag).where(Tag.status != "disabled")
    if tag_type and tag_type != "all":
        tag_stmt = tag_stmt.where(Tag.type == tag_type)
    if tag_id is not None:
        tag_stmt = tag_stmt.where(Tag.id == tag_id)
    tags = list(db.scalars(tag_stmt))
    tags_by_id = {tag.id: tag for tag in tags}

    for tag in tags:
        if _contains(text, tag.name):
            matches.setdefault(tag.id, SourceTagMatch(tag_id=tag.id, trigger_text=tag.name, extractor="rule"))

    stock_relations = list(db.scalars(select(StockTagRelation).where(StockTagRelation.status != "disabled")))
    for rel in stock_relations:
        tag = tags_by_id.get(rel.tag_id)
        if tag and _contains(text, tag.name):
            matches.setdefault(tag.id, SourceTagMatch(tag_id=tag.id, trigger_text=tag.name, extractor="relation_rule"))

    track_relations = list(db.scalars(select(TrackTagRelation).where(TrackTagRelation.status != "disabled")))
    for rel in track_relations:
        tag = tags_by_id.get(rel.tag_id)
        if tag and _contains(text, tag.name):
            matches.setdefault(tag.id, SourceTagMatch(tag_id=tag.id, trigger_text=tag.name, extractor="relation_rule"))

    hotwords = list(db.scalars(select(HotwordTagRelation).where(HotwordTagRelation.status != "disabled")))
    for rel in hotwords:
        if rel.tag_id in tags_by_id and _contains(text, rel.hotword):
            matches.setdefault(rel.tag_id, SourceTagMatch(tag_id=rel.tag_id, trigger_text=rel.hotword, extractor="relation_rule"))

    return sorted(matches.values(), key=lambda m: m.tag_id)
