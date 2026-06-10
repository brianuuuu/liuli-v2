from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

import invest_assistant.modules.basic.stock_master.models  # noqa: F401
import invest_assistant.modules.track_discovery.models  # noqa: F401
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.knowledge_base.models import KnowledgeNote, KnowledgeNoteTagRelation
from invest_assistant.modules.knowledge_base.schemas import KnowledgeNoteCreate, KnowledgeNoteGroupCreate
from invest_assistant.modules.knowledge_base import service
from invest_assistant.modules.market_radar.models import Tag


TEST_DB_ROOT = Path("var/cache/test-knowledge-notes")


def make_session(name: str):
    TEST_DB_ROOT.mkdir(parents=True, exist_ok=True)
    db_path = TEST_DB_ROOT / f"{name}-{uuid4()}.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    service.ensure_knowledge_base_schema(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False), engine


def add_tag(db, name: str) -> Tag:
    tag = Tag(name=name, type="track", source="test", status="active")
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def test_create_note_with_group_and_existing_tags():
    SessionLocal, _ = make_session("create")
    db = SessionLocal()
    try:
        group = service.create_note_group(db, KnowledgeNoteGroupCreate(name="复盘", sort_order=10))
        ai = add_tag(db, "AI")
        compute = add_tag(db, "算力")

        note = service.create_note(
            db,
            KnowledgeNoteCreate(
                title="算力订单复盘",
                content="订单还需要验证交付节奏",
                note_type="review",
                group_id=group.id,
                tag_ids=[ai.id, compute.id],
            ),
        )

        page = service.list_notes(db, limit=20, offset=0)

        assert note.group_id == group.id
        assert page.total == 1
        assert page.has_more is False
        assert page.items[0].group is not None
        assert page.items[0].group.name == "复盘"
        assert [tag.name for tag in page.items[0].tags] == ["AI", "算力"]
    finally:
        db.close()


def test_notes_page_supports_pagination_and_filters():
    SessionLocal, _ = make_session("filters")
    db = SessionLocal()
    try:
        review = service.create_note_group(db, KnowledgeNoteGroupCreate(name="复盘"))
        principle = service.create_note_group(db, KnowledgeNoteGroupCreate(name="原则"))
        ai = add_tag(db, "AI")
        pharma = add_tag(db, "创新药")

        service.create_note(db, KnowledgeNoteCreate(title="算力复盘", content="AI 订单验证", note_type="review", group_id=review.id, tag_ids=[ai.id]))
        service.create_note(db, KnowledgeNoteCreate(title="药企复盘", content="创新药 管线", note_type="review", group_id=review.id, tag_ids=[pharma.id]))
        service.create_note(db, KnowledgeNoteCreate(title="原则", content="先验证持续性", note_type="principle", group_id=principle.id, tag_ids=[ai.id]))

        first_page = service.list_notes(db, limit=2, offset=0)
        second_page = service.list_notes(db, limit=2, offset=2)
        ai_page = service.list_notes(db, tag_id=ai.id, limit=20, offset=0)
        review_page = service.list_notes(db, group_id=review.id, limit=20, offset=0)
        query_page = service.list_notes(db, q="管线", limit=20, offset=0)

        assert first_page.total == 3
        assert first_page.has_more is True
        assert len(first_page.items) == 2
        assert second_page.has_more is False
        assert [item.title for item in ai_page.items] == ["原则", "算力复盘"]
        assert [item.title for item in review_page.items] == ["药企复盘", "算力复盘"]
        assert [item.title for item in query_page.items] == ["药企复盘"]
    finally:
        db.close()


def test_update_note_replaces_tag_relations_and_status_actions_are_soft():
    SessionLocal, _ = make_session("update")
    db = SessionLocal()
    try:
        ai = add_tag(db, "AI")
        robot = add_tag(db, "机器人")
        note = service.create_note(db, KnowledgeNoteCreate(title="旧标题", content="旧正文", note_type="review", tag_ids=[ai.id]))

        updated = service.update_note(
            db,
            note,
            KnowledgeNoteCreate(title="新标题", content="新正文", note_type="principle", tag_ids=[robot.id]),
        )
        archived = service.archive_note(db, updated)
        assert archived.status == "archived"
        deleted = service.delete_note(db, archived)
        assert deleted.status == "deleted"
        restored = service.restore_note(db, deleted)
        relations = list(db.scalars(select(KnowledgeNoteTagRelation).where(KnowledgeNoteTagRelation.note_id == note.id)))

        assert updated.title == "新标题"
        assert updated.note_type == "principle"
        assert [relation.tag_id for relation in relations] == [robot.id]
        assert restored.status == "active"
        assert db.get(KnowledgeNote, note.id) is not None
    finally:
        db.close()


def test_create_note_rejects_missing_tag_without_creating_note():
    SessionLocal, _ = make_session("missing-tag")
    db = SessionLocal()
    try:
        try:
            service.create_note(db, KnowledgeNoteCreate(title="无效标签", content="不应保存", note_type="review", tag_ids=[999]))
        except ValueError as exc:
            assert "tag not found or inactive" in str(exc)
        else:
            raise AssertionError("missing tag should raise ValueError")

        assert db.scalar(select(KnowledgeNote)) is None
    finally:
        db.close()


def test_archiving_group_moves_notes_to_ungrouped():
    SessionLocal, _ = make_session("archive-group")
    db = SessionLocal()
    try:
        group = service.create_note_group(db, KnowledgeNoteGroupCreate(name="错误案例"))
        note = service.create_note(db, KnowledgeNoteCreate(title="错误复盘", content="把事件当趋势", note_type="mistake", group_id=group.id))

        archived_group = service.archive_note_group(db, group)
        db.refresh(note)

        assert archived_group.status == "archived"
        assert note.group_id is None
    finally:
        db.close()


def test_ensure_knowledge_base_schema_adds_missing_note_columns_to_existing_sqlite_table():
    TEST_DB_ROOT.mkdir(parents=True, exist_ok=True)
    db_path = TEST_DB_ROOT / f"ensure-{uuid4()}.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE knowledge_note (id INTEGER PRIMARY KEY, content TEXT NOT NULL, note_type VARCHAR(64) NOT NULL)"))

    service.ensure_knowledge_base_schema(engine)

    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(knowledge_note)")).all()}
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).all()}

    assert {
        "title",
        "content",
        "note_type",
        "group_id",
        "related_module",
        "related_id",
        "tags",
        "status",
        "created_at",
        "updated_at",
    }.issubset(columns)
    assert "knowledge_note_group" in tables
    assert "knowledge_note_tag_relation" in tables

    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    db = SessionLocal()
    try:
        note = service.create_note(db, KnowledgeNoteCreate(content="迁移后保存", note_type="review"))
        assert note.title == "迁移后保存"
    finally:
        db.close()
