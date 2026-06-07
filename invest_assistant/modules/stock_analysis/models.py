from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class StockPoolItem(Base):
    __tablename__ = "stock_pool"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="candidate")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class StockResearchNote(Base):
    __tablename__ = "stock_research_note"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    note_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    related_track_id: Mapped[int | None] = mapped_column(ForeignKey("track.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class StockScoreSnapshot(Base):
    __tablename__ = "stock_score_snapshot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    score_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    track_id: Mapped[int | None] = mapped_column(ForeignKey("track.id"), nullable=True)
    growth_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    valuation_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    moat_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    total_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class StockDailyBar(Base):
    __tablename__ = "stock_daily_bar"
    __table_args__ = (
        UniqueConstraint("stock_id", "trade_date", "adj", "source", name="uq_stock_daily_bar_stock_date_adj_source"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    ts_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    pre_close: Mapped[float | None] = mapped_column(Float, nullable=True)
    change: Mapped[float | None] = mapped_column(Float, nullable=True)
    pct_chg: Mapped[float | None] = mapped_column(Float, nullable=True)
    vol: Mapped[float | None] = mapped_column(Float, nullable=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    ma5: Mapped[float | None] = mapped_column(Float, nullable=True)
    ma20: Mapped[float | None] = mapped_column(Float, nullable=True)
    ma60: Mapped[float | None] = mapped_column(Float, nullable=True)
    ma250: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="tushare", index=True)
    adj: Mapped[str] = mapped_column(String(16), nullable=False, default="qfq", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class StockValuationSnapshot(Base):
    __tablename__ = "stock_valuation_snapshot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    report_period: Mapped[str | None] = mapped_column(String(32), nullable=True)
    report_release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    current_market_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    financial_performance_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    trend_reference_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    guidance_check_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    quarter_performance: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quarter_main_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    profit_model_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    fcf_model_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    revenue_model_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_model: Mapped[str | None] = mapped_column(String(32), nullable=True)
    expected_market_value_3y: Mapped[float | None] = mapped_column(Float, nullable=True)
    expectation_gap_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    analysis_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    researcher: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class StockCompareGroup(Base):
    __tablename__ = "stock_compare_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    track_id: Mapped[int | None] = mapped_column(ForeignKey("track.id"), nullable=True)
    stock_ids: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class StockTrackRelation(Base):
    __tablename__ = "stock_track_relation"
    __table_args__ = (UniqueConstraint("stock_id", "track_id", name="uq_stock_track_relation"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("track.id"), nullable=False, index=True)
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


class StockMaterial(Base):
    __tablename__ = "stock_material"
    __table_args__ = (UniqueConstraint("stock_id", "material_type", "material_id", name="uq_stock_material_ref"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    material_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # source_item / knowledge_note
    material_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    impact_direction: Mapped[str | None] = mapped_column(String(32), nullable=True)  # positive / negative / neutral / noise
    importance_level: Mapped[str | None] = mapped_column(String(16), nullable=True)  # high / medium / low
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)  # pending / confirmed / ignored
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
