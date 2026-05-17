from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class StockPoolItem(Base):
    __tablename__ = "stock_pool_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="watching")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class StockResearchNote(Base):
    __tablename__ = "stock_research_note"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    note_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    related_track_id: Mapped[int | None] = mapped_column(ForeignKey("track_thesis.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class StockScoreSnapshot(Base):
    __tablename__ = "stock_score_snapshot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    score_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    track_id: Mapped[int | None] = mapped_column(ForeignKey("track_thesis.id"), nullable=True)
    growth_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    valuation_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    moat_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    total_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class StockCompareGroup(Base):
    __tablename__ = "stock_compare_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    track_id: Mapped[int | None] = mapped_column(ForeignKey("track_thesis.id"), nullable=True)
    stock_ids: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class StockTrackTagBinding(Base):
    __tablename__ = "stock_track_tag_binding"
    __table_args__ = (UniqueConstraint("stock_id", "track_tag_id", name="uq_stock_track_tag_binding"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    track_tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    relation_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    conviction: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class StockThesis(Base):
    __tablename__ = "stock_thesis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    thesis_text: Mapped[str] = mapped_column(Text, nullable=False)
    key_logic: Mapped[str | None] = mapped_column(Text, nullable=True)
    validation_indicators: Mapped[str | None] = mapped_column(Text, nullable=True)
    falsification_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
