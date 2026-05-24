from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import StockAlias
from invest_assistant.modules.market_radar.models import HotwordAlias, SourceItem, Tag
from invest_assistant.modules.track_discovery.models import TrackAlias


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


def resolve_source_tag_matches(
    db: Session,
    item: SourceItem,
    tag_type: str | None = None,
    tag_id: int | None = None,
) -> list[SourceTagMatch]:
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

    stock_tag_by_stock_id = {
        tag.stock_id: tag
        for tag in tags
        if tag.type == "stock" and tag.stock_id is not None
    }
    if stock_tag_by_stock_id:
        aliases = db.scalars(select(StockAlias).where(StockAlias.stock_id.in_(stock_tag_by_stock_id.keys()))).all()
        for alias in aliases:
            tag = stock_tag_by_stock_id.get(alias.stock_id)
            if tag is not None and _contains(text, alias.alias):
                matches.setdefault(tag.id, SourceTagMatch(tag_id=tag.id, trigger_text=alias.alias, extractor="alias_rule"))

    track_tag_by_track_id = {
        tag.track_id: tag
        for tag in tags
        if tag.type == "track" and tag.track_id is not None
    }
    if track_tag_by_track_id:
        aliases = db.scalars(
            select(TrackAlias).where(
                TrackAlias.track_id.in_(track_tag_by_track_id.keys()),
                TrackAlias.status != "disabled",
            )
        ).all()
        for alias in aliases:
            tag = track_tag_by_track_id.get(alias.track_id)
            if tag is not None and _contains(text, alias.alias):
                matches.setdefault(tag.id, SourceTagMatch(tag_id=tag.id, trigger_text=alias.alias, extractor="alias_rule"))

    hotword_tag_ids = [tag.id for tag in tags if tag.type == "hotword"]
    if hotword_tag_ids:
        aliases = db.scalars(
            select(HotwordAlias).where(
                HotwordAlias.tag_id.in_(hotword_tag_ids),
                HotwordAlias.status != "disabled",
            )
        ).all()
        for alias in aliases:
            if alias.tag_id in tags_by_id and _contains(text, alias.alias):
                matches.setdefault(alias.tag_id, SourceTagMatch(tag_id=alias.tag_id, trigger_text=alias.alias, extractor="alias_rule"))

    return sorted(matches.values(), key=lambda match: match.tag_id)
