from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class Track(Base):
    __tablename__ = "track"
    __table_args__ = (UniqueConstraint("name", name="uq_track_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="candidate", index=True)
    track_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_view: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    confidence_level: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class TrackMaterial(Base):
    __tablename__ = "track_material"
    __table_args__ = (UniqueConstraint("track_id", "material_type", "material_id", name="uq_track_material_ref"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("track.id"), nullable=False, index=True)
    material_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    material_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    direction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    importance_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class TrackAnalysisSnapshot(Base):
    __tablename__ = "track_analysis_snapshot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("track.id"), nullable=False, index=True)
    analysis_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    market_space: Mapped[str | None] = mapped_column(Text, nullable=True)
    market_size: Mapped[str | None] = mapped_column(Text, nullable=True)
    growth_rate: Mapped[str | None] = mapped_column(Text, nullable=True)
    heat_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    opportunity_points: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_points: Mapped[str | None] = mapped_column(Text, nullable=True)
    watch_signals: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class TrackStatusHistory(Base):
    __tablename__ = "track_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("track.id"), nullable=False, index=True)
    old_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    new_status: Mapped[str] = mapped_column(String(32), nullable=False)
    old_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    new_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


def ensure_track_discovery_schema(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        track_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(track)")).all()}
        track_additions = {
            "track_score": "ALTER TABLE track ADD COLUMN track_score FLOAT",
            "current_view": "ALTER TABLE track ADD COLUMN current_view TEXT",
            "stage": "ALTER TABLE track ADD COLUMN stage VARCHAR(32)",
            "confidence_level": "ALTER TABLE track ADD COLUMN confidence_level VARCHAR(32)",
        }
        for column, statement in track_additions.items():
            if column not in track_columns:
                conn.execute(text(statement))

        history_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(track_status_history)")).all()}
        history_additions = {
            "old_stage": "ALTER TABLE track_status_history ADD COLUMN old_stage VARCHAR(32)",
            "new_stage": "ALTER TABLE track_status_history ADD COLUMN new_stage VARCHAR(32)",
            "changed_by": "ALTER TABLE track_status_history ADD COLUMN changed_by VARCHAR(32) NOT NULL DEFAULT 'manual'",
        }
        for column, statement in history_additions.items():
            if column not in history_columns:
                conn.execute(text(statement))
