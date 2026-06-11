from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class Tag(Base):
    __tablename__ = "tag"
    __table_args__ = (UniqueConstraint("name", name="uq_tag_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    type: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class StockTagRelation(Base):
    __tablename__ = "stock_tag_relation"
    __table_args__ = (UniqueConstraint("stock_id", "tag_id", name="uq_stock_tag_relation"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class TrackTagRelation(Base):
    __tablename__ = "track_tag_relation"
    __table_args__ = (
        UniqueConstraint("track_id", "tag_id", name="uq_track_tag_relation"),
        Index("ix_track_tag_relation_status_tag_track", "status", "tag_id", "track_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("track.id"), nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class Hotword(Base):
    __tablename__ = "hotword"
    __table_args__ = (UniqueConstraint("name", name="uq_hotword_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class HotwordTagRelation(Base):
    __tablename__ = "hotword_tag_relation"
    __table_args__ = (UniqueConstraint("hotword_id", "tag_id", name="uq_hotword_tag_relation"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hotword_id: Mapped[int] = mapped_column(ForeignKey("hotword.id"), nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class SourceItem(Base):
    __tablename__ = "source_item"
    __table_args__ = (
        Index("ix_source_item_feed_order", "publish_time", "id"),
        Index("ix_source_item_url_dedupe_lookup", "source_type", "source_name", "source_url"),
        Index("ix_source_item_title_time_dedupe_lookup", "source_type", "source_name", "publish_time", "title"),
        Index("ix_source_item_daily_stats", "publish_time", "created_at", "source_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    publish_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    related_type: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    related_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class SourceTag(Base):
    __tablename__ = "source_tag"
    __table_args__ = (UniqueConstraint("source_item_id", "tag_id", name="uq_source_tag_item_tag"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_item_id: Mapped[int] = mapped_column(ForeignKey("source_item.id"), nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    trigger_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    extractor: Mapped[str] = mapped_column(String(32), nullable=False, default="rule")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class TagHeatSnapshot(Base):
    __tablename__ = "tag_heat_snapshot"
    __table_args__ = (
        Index("ix_tag_heat_snapshot_ranking_lookup", "window_type", "stat_time", "rank_no"),
        Index("ix_tag_heat_snapshot_trend_lookup", "tag_id", "window_type", "stat_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    window_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    stat_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    trigger_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heat_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    avg_count: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    change_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    rank_no: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class TagEdgeSnapshot(Base):
    __tablename__ = "tag_edge_snapshot"
    __table_args__ = (
        Index("ix_tag_edge_snapshot_graph_lookup", "window_type", "related_tag_type", "stat_time", "weight"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    related_tag_id: Mapped[int] = mapped_column(ForeignKey("tag.id"), nullable=False, index=True)
    related_tag_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    window_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    stat_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    cooccur_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    latest_source_item_id: Mapped[int | None] = mapped_column(ForeignKey("source_item.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class AiTagSuggestion(Base):
    __tablename__ = "ai_tag_suggestion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    suggested_text: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    final_tag_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    rejected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    final_tag_id: Mapped[int | None] = mapped_column(ForeignKey("tag.id"), nullable=True)
    ext_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


def ensure_market_radar_schema(engine: Engine) -> None:
    for table in (SourceItem.__table__, TrackTagRelation.__table__, TagHeatSnapshot.__table__, TagEdgeSnapshot.__table__):
        for index in table.indexes:
            index.create(bind=engine, checkfirst=True)
