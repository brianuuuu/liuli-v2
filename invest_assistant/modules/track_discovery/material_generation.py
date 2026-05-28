from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.market_radar.models import SourceTag, Tag, TrackTagRelation
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial


def create_pending_materials_for_source_item(
    db: Session,
    source_item_id: int,
    tag_ids: Iterable[int] | None = None,
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

    track_ids = {
        int(track_id)
        for track_id in db.scalars(
            select(TrackTagRelation.track_id)
            .join(Track, Track.id == TrackTagRelation.track_id)
            .where(
                TrackTagRelation.tag_id.in_(matched_tag_ids),
                TrackTagRelation.status == "active",
                Track.status != "archived",
            )
            .distinct()
        )
    }
    if not track_ids:
        return 0

    existing_track_ids = {
        int(track_id)
        for track_id in db.scalars(
            select(TrackMaterial.track_id).where(
                TrackMaterial.track_id.in_(track_ids),
                TrackMaterial.material_type == "source_item",
                TrackMaterial.material_id == source_item_id,
            )
        )
    }
    inserted = 0
    for track_id in sorted(track_ids - existing_track_ids):
        db.add(
            TrackMaterial(
                track_id=track_id,
                material_type="source_item",
                material_id=source_item_id,
                status="pending",
            )
        )
        inserted += 1
    if inserted:
        db.flush()
    return inserted
