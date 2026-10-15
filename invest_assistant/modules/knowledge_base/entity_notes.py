"""笔记按标签归属到标的和赛道。

笔记与材料并列，不经材料表引用：笔记打的标签只要绑定在某个标的或赛道上，这条笔记就属于它，
查询时实时关联，不落中间记录。笔记是人的重大想法，数量很少，全量返回不分页。

单独成模块而不放进 service：knowledge_base.service 依赖 stock_analysis / track_discovery 的
service，这两个模块又要反过来查笔记，放在这里只依赖模型，避免循环导入。
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.knowledge_base.models import KnowledgeNote, KnowledgeNoteGroup, KnowledgeNoteTagRelation
from invest_assistant.modules.knowledge_base.schemas import KnowledgeNoteGroupRead, KnowledgeNoteRead, KnowledgeNoteTagRead
from invest_assistant.modules.market_radar.models import StockTagRelation, Tag, TrackTagRelation

ACTIVE_STATUS = "active"


def list_stock_notes(db: Session, stock_id: int) -> list[KnowledgeNoteRead]:
    tag_ids = select(StockTagRelation.tag_id).where(StockTagRelation.stock_id == stock_id, StockTagRelation.status == ACTIVE_STATUS)
    return _notes_for_tag_ids(db, tag_ids)


def list_track_notes(db: Session, track_id: int) -> list[KnowledgeNoteRead]:
    tag_ids = select(TrackTagRelation.tag_id).where(TrackTagRelation.track_id == track_id, TrackTagRelation.status == ACTIVE_STATUS)
    return _notes_for_tag_ids(db, tag_ids)


def _notes_for_tag_ids(db: Session, tag_ids) -> list[KnowledgeNoteRead]:
    note_ids = select(KnowledgeNoteTagRelation.note_id).where(KnowledgeNoteTagRelation.tag_id.in_(tag_ids))
    rows = list(
        db.scalars(
            select(KnowledgeNote)
            .where(KnowledgeNote.id.in_(note_ids), KnowledgeNote.status == ACTIVE_STATUS)
            .order_by(KnowledgeNote.created_at.desc(), KnowledgeNote.id.desc())
        )
    )
    return note_reads(db, rows)


def note_reads(db: Session, rows: list[KnowledgeNote]) -> list[KnowledgeNoteRead]:
    if not rows:
        return []
    group_ids = {row.group_id for row in rows if row.group_id is not None}
    note_ids = [row.id for row in rows]
    groups = {
        group.id: group
        for group in db.scalars(select(KnowledgeNoteGroup).where(KnowledgeNoteGroup.id.in_(group_ids))).all()
    } if group_ids else {}
    relation_rows = db.execute(
        select(KnowledgeNoteTagRelation.note_id, Tag)
        .join(Tag, Tag.id == KnowledgeNoteTagRelation.tag_id)
        .where(KnowledgeNoteTagRelation.note_id.in_(note_ids))
        .order_by(KnowledgeNoteTagRelation.id.asc())
    ).all()
    tags_by_note: dict[int, list[Tag]] = {}
    for note_id, tag in relation_rows:
        tags_by_note.setdefault(note_id, []).append(tag)
    return [
        KnowledgeNoteRead(
            id=row.id,
            title=row.title,
            content=row.content,
            note_type=row.note_type,
            group_id=row.group_id,
            related_module=row.related_module,
            related_id=row.related_id,
            tags_text=row.tags,
            status=row.status,
            created_at=row.created_at,
            updated_at=row.updated_at,
            group=KnowledgeNoteGroupRead.model_validate(groups[row.group_id]) if row.group_id in groups else None,
            tags=[KnowledgeNoteTagRead.model_validate(tag) for tag in tags_by_note.get(row.id, [])],
        )
        for row in rows
    ]
