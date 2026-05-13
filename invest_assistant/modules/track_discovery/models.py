from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class TrackThesis(Base):
    __tablename__ = "track_thesis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    core_thesis: Mapped[str] = mapped_column(Text, nullable=False)
    underlying_change: Mapped[str | None] = mapped_column(Text, nullable=True)
    old_bottleneck: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_solution: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_chain_shift: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_horizon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confidence_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="watching")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class TrackValidationIndicator(Base):
    __tablename__ = "track_validation_indicator"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thesis_id: Mapped[int] = mapped_column(ForeignKey("track_thesis.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    indicator_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    data_source: Mapped[str | None] = mapped_column(String(128), nullable=True)
    current_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    validation_meaning: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class TrackEvidence(Base):
    __tablename__ = "track_evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thesis_id: Mapped[int] = mapped_column(ForeignKey("track_thesis.id"), nullable=False, index=True)
    source_item_id: Mapped[int | None] = mapped_column(ForeignKey("source_item.id"), nullable=True, index=True)
    evidence_direction: Mapped[str] = mapped_column(String(32), nullable=False)
    evidence_strength: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    affected_segments: Mapped[str | None] = mapped_column(Text, nullable=True)
    related_stock_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class TrackRelatedStock(Base):
    __tablename__ = "track_related_stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thesis_id: Mapped[int] = mapped_column(ForeignKey("track_thesis.id"), nullable=False, index=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    role: Mapped[str | None] = mapped_column(String(128), nullable=True)
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heat_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="candidate")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class TrackStatusHistory(Base):
    __tablename__ = "track_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thesis_id: Mapped[int] = mapped_column(ForeignKey("track_thesis.id"), nullable=False, index=True)
    old_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    new_status: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
