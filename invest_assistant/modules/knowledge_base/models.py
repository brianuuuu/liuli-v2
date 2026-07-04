from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class KnowledgeNoteGroup(Base):
    __tablename__ = "knowledge_note_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class KnowledgeNote(Base):
    __tablename__ = "knowledge_note"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    note_type: Mapped[str] = mapped_column(String(64), nullable=False)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("knowledge_note_group.id"), nullable=True, index=True)
    related_module: Mapped[str | None] = mapped_column(String(64), nullable=True)
    related_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class KnowledgeNoteTagRelation(Base):
    __tablename__ = "knowledge_note_tag_relation"
    __table_args__ = (UniqueConstraint("note_id", "tag_id", name="uq_knowledge_note_tag_relation"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("knowledge_note.id"), nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class KnowledgeResearcher(Base):
    __tablename__ = "knowledge_researcher"
    __table_args__ = (UniqueConstraint("researcher_code", name="uq_knowledge_researcher_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    researcher_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    profile_path: Mapped[str] = mapped_column(String(512), nullable=False)
    profile_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class KnowledgePrompt(Base):
    __tablename__ = "knowledge_prompt"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prompt_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_task: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="deepseek")
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    user_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    response_format: Mapped[str] = mapped_column(String(64), nullable=False, default="json_object")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class KnowledgeResearchFeedback(Base):
    __tablename__ = "knowledge_research_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    report_id: Mapped[int | None] = mapped_column(ForeignKey("report.id"), nullable=True, index=True)
    report_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    researcher_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    skill_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    business_module: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="mcp", index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="received", index=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


def ensure_knowledge_base_schema(engine: Engine) -> None:
    KnowledgeNoteGroup.__table__.create(bind=engine, checkfirst=True)
    KnowledgeNoteTagRelation.__table__.create(bind=engine, checkfirst=True)
    KnowledgeResearcher.__table__.create(bind=engine, checkfirst=True)
    KnowledgeResearchFeedback.__table__.create(bind=engine, checkfirst=True)
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        note_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(knowledge_note)")).all()}
        note_column_migrations = {
            "title": "ALTER TABLE knowledge_note ADD COLUMN title VARCHAR(255)",
            "content": "ALTER TABLE knowledge_note ADD COLUMN content TEXT",
            "note_type": "ALTER TABLE knowledge_note ADD COLUMN note_type VARCHAR(64)",
            "group_id": "ALTER TABLE knowledge_note ADD COLUMN group_id INTEGER",
            "related_module": "ALTER TABLE knowledge_note ADD COLUMN related_module VARCHAR(64)",
            "related_id": "ALTER TABLE knowledge_note ADD COLUMN related_id INTEGER",
            "tags": "ALTER TABLE knowledge_note ADD COLUMN tags TEXT",
            "status": "ALTER TABLE knowledge_note ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active'",
            "created_at": "ALTER TABLE knowledge_note ADD COLUMN created_at DATETIME",
            "updated_at": "ALTER TABLE knowledge_note ADD COLUMN updated_at DATETIME",
        }
        for column_name, statement in note_column_migrations.items():
            if column_name not in note_columns:
                conn.execute(text(statement))
        researcher_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(knowledge_researcher)")).all()}
        researcher_column_migrations = {
            "researcher_code": "ALTER TABLE knowledge_researcher ADD COLUMN researcher_code VARCHAR(64)",
            "display_name": "ALTER TABLE knowledge_researcher ADD COLUMN display_name VARCHAR(255)",
            "profile_path": "ALTER TABLE knowledge_researcher ADD COLUMN profile_path VARCHAR(512)",
            "profile_hash": "ALTER TABLE knowledge_researcher ADD COLUMN profile_hash VARCHAR(128)",
        }
        for column_name, statement in researcher_column_migrations.items():
            if column_name not in researcher_columns:
                conn.execute(text(statement))
        feedback_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(knowledge_research_feedback)")).all()}
        feedback_column_migrations = {
            "report_id": "ALTER TABLE knowledge_research_feedback ADD COLUMN report_id INTEGER",
            "report_path": "ALTER TABLE knowledge_research_feedback ADD COLUMN report_path VARCHAR(512)",
            "researcher_code": "ALTER TABLE knowledge_research_feedback ADD COLUMN researcher_code VARCHAR(64)",
            "skill_name": "ALTER TABLE knowledge_research_feedback ADD COLUMN skill_name VARCHAR(128)",
            "business_module": "ALTER TABLE knowledge_research_feedback ADD COLUMN business_module VARCHAR(64)",
            "source": "ALTER TABLE knowledge_research_feedback ADD COLUMN source VARCHAR(64) NOT NULL DEFAULT 'mcp'",
            "status": "ALTER TABLE knowledge_research_feedback ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'received'",
            "returned_at": "ALTER TABLE knowledge_research_feedback ADD COLUMN returned_at DATETIME",
            "created_at": "ALTER TABLE knowledge_research_feedback ADD COLUMN created_at DATETIME",
            "updated_at": "ALTER TABLE knowledge_research_feedback ADD COLUMN updated_at DATETIME",
        }
        for column_name, statement in feedback_column_migrations.items():
            if column_name not in feedback_columns:
                conn.execute(text(statement))
