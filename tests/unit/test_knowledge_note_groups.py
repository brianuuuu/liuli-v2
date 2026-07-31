from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

import invest_assistant.modules.basic.stock_master.models  # noqa: F401
import invest_assistant.modules.track_discovery.models  # noqa: F401
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.knowledge_base import router, schemas, service
from invest_assistant.modules.knowledge_base.models import KnowledgeNoteGroup
from invest_assistant.modules.knowledge_base.schemas import KnowledgeNoteGroupCreate


TEST_DB_ROOT = Path("var/cache/test-knowledge-note-groups")


def make_session(name: str):
    TEST_DB_ROOT.mkdir(parents=True, exist_ok=True)
    db_path = TEST_DB_ROOT / f"{name}-{uuid4()}.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    service.ensure_knowledge_base_schema(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def add_groups(db):
    first = service.create_note_group(db, KnowledgeNoteGroupCreate(name="复盘", sort_order=10))
    second = service.create_note_group(db, KnowledgeNoteGroupCreate(name="原则", sort_order=20))
    archived = service.create_note_group(
        db,
        KnowledgeNoteGroupCreate(name="归档", sort_order=30, status="archived"),
    )
    return first, second, archived


def current_orders(db):
    return {
        item.id: (item.sort_order, item.status)
        for item in db.scalars(select(KnowledgeNoteGroup).order_by(KnowledgeNoteGroup.id)).all()
    }


def test_reorder_note_groups_saves_a_continuous_complete_active_order():
    SessionLocal = make_session("success")
    db = SessionLocal()
    try:
        first, second, archived = add_groups(db)

        reordered = service.reorder_note_groups(db, [second.id, first.id])

        assert [item.id for item in reordered] == [second.id, first.id]
        assert [item.sort_order for item in reordered] == [0, 1]
        assert current_orders(db)[archived.id] == (30, "archived")
    finally:
        db.close()


@pytest.mark.parametrize(
    ("case", "ordered_ids", "error_type"),
    [
        ("duplicate", lambda first, second, archived: [first.id, first.id], ValueError),
        ("missing-active", lambda first, second, archived: [first.id], ValueError),
        ("archived", lambda first, second, archived: [first.id, second.id, archived.id], ValueError),
        ("unknown", lambda first, second, archived: [first.id, second.id, 999_999], LookupError),
    ],
)
def test_reorder_note_groups_rejects_invalid_sets_without_partial_updates(case, ordered_ids, error_type):
    SessionLocal = make_session(case)
    db = SessionLocal()
    try:
        first, second, archived = add_groups(db)
        before = current_orders(db)

        with pytest.raises(error_type):
            service.reorder_note_groups(db, ordered_ids(first, second, archived))

        db.expire_all()
        assert current_orders(db) == before
    finally:
        db.close()


def test_reorder_schema_rejects_duplicate_ids():
    payload_type = getattr(schemas, "KnowledgeNoteGroupReorder", None)
    assert payload_type is not None

    with pytest.raises(ValueError):
        payload_type(ordered_ids=[4, 4])


@pytest.mark.parametrize(
    ("ordered_ids", "status_code"),
    [
        (lambda first, second: [first.id], 400),
        (lambda first, second: [first.id, second.id, 999_999], 404),
    ],
)
def test_reorder_route_maps_invalid_sets_to_stable_http_statuses(ordered_ids, status_code):
    SessionLocal = make_session(f"route-{status_code}")
    db = SessionLocal()
    try:
        first, second, _ = add_groups(db)
        payload_type = getattr(schemas, "KnowledgeNoteGroupReorder", None)
        route_handler = getattr(router, "reorder_note_groups", None)
        assert payload_type is not None
        assert route_handler is not None

        with pytest.raises(HTTPException) as exc_info:
            route_handler(payload_type(ordered_ids=ordered_ids(first, second)), db)

        assert exc_info.value.status_code == status_code
    finally:
        db.close()
