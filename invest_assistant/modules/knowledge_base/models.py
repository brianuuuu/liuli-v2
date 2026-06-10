from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, text
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


class KnowledgeSkill(Base):
    __tablename__ = "knowledge_skill"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    skill_type: Mapped[str] = mapped_column(String(64), nullable=False)
    principle: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_schema: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_schema: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class KnowledgeAgent(Base):
    __tablename__ = "knowledge_agent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_module: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    workflow_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
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


class KnowledgeFeedbackLog(Base):
    __tablename__ = "knowledge_feedback_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("knowledge_agent.id"), nullable=True, index=True)
    target_module: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback_type: Mapped[str] = mapped_column(String(64), nullable=False)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    effectiveness: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


def ensure_knowledge_base_schema(engine: Engine) -> None:
    KnowledgeNoteGroup.__table__.create(bind=engine, checkfirst=True)
    KnowledgeNoteTagRelation.__table__.create(bind=engine, checkfirst=True)
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
