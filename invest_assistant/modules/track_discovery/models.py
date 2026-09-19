from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
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
    current_view: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 产业阶段和市场阶段是两件事：产业还在扩张期，市场可能已经进入退潮期。
    # 原来合成一个 stage 字段，两种语义互相覆盖，一次只能保留其中一个判断。
    industry_phase: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    market_phase: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    confidence_level: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # 最新快照指针，由导入回填。看板要按最新结论排序，没有指针就要对每条赛道各查一次。
    # 不建外键：track 和 track_trend_snapshot 互相引用，加约束会让建表顺序和迁移都变复杂。
    latest_snapshot_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class TrackMaterial(Base):
    __tablename__ = "track_material"
    __table_args__ = (
        UniqueConstraint("track_id", "material_type", "material_id", name="uq_track_material_ref"),
        Index("ix_track_material_track_status_updated", "track_id", "status", "updated_at"),
    )

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


class TrackTrendSnapshot(Base):
    """赛道趋势研究结论快照，由知识库研究回流导入写入，纯追加，同一天允许多份。

    与 stock_trend_snapshot 同构：一份研究员报告等于一条快照，报告原文经 report_id 回溯。
    所有判断描述一律 Text，只有枚举码用 String——stock_trend_snapshot 就是因为把判断
    描述按 VARCHAR(50) 建，PostgreSQL 直接拒收整条快照，才回头加宽的。
    """

    __tablename__ = "track_trend_snapshot"
    __table_args__ = (Index("ix_track_trend_snapshot_track_date", "track_id", "research_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("track.id"), nullable=False, index=True)
    research_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    researcher_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    report_id: Mapped[int | None] = mapped_column(ForeignKey("report.id"), nullable=True, index=True)

    # 卡片层：赛道卡上的"强 · 长期"直接读这两列，不从三周期里二次推导。
    headline_cycle: Mapped[str] = mapped_column(String(16), nullable=False)
    headline_strength: Mapped[str] = mapped_column(String(16), nullable=False)
    core_judgment: Mapped[str | None] = mapped_column(Text, nullable=True)
    research_priority: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    # 只在做过同批多赛道排名时才有值，未排名为 null。
    priority_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence_level: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # 三周期判断：周期恒定是 3 个、永远同写同读，扁平列比子表少一次 join。
    short_strength: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    short_direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    short_basis: Mapped[str | None] = mapped_column(Text, nullable=True)
    mid_strength: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    mid_direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    mid_basis: Mapped[str | None] = mapped_column(Text, nullable=True)
    long_strength: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    long_direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    long_basis: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 六项核心分析，固定框架，Web 按六宫格渲染。
    demand_space: Mapped[str | None] = mapped_column(Text, nullable=True)
    supply_competition: Mapped[str | None] = mapped_column(Text, nullable=True)
    profit_cashflow: Mapped[str | None] = mapped_column(Text, nullable=True)
    policy_catalyst: Mapped[str | None] = mapped_column(Text, nullable=True)
    market_capital: Mapped[str | None] = mapped_column(Text, nullable=True)
    pricing_expectation_gap: Mapped[str | None] = mapped_column(Text, nullable=True)

    key_contradiction: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{segment, stance: benefiting|pressured, reason, constraint, representative_stocks: []}]
    # 代表公司只作为报告原文留存，可检索的标的绑定归 stock_track_relation，这里不开第二个 owner。
    segments_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    industry_phase: Mapped[str | None] = mapped_column(String(32), nullable=True)
    market_phase: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # [{name: base|bull|bear, key_variable, trigger, path, window}]
    scenarios_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_verification: Mapped[str | None] = mapped_column(Text, nullable=True)

    risk_falsification: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_vs_last: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_gaps: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{type, source, as_of}]：各类数据的截止日期写在每条来源上，而不是快照级的单个日期。
    data_sources_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class TrackStatusHistory(Base):
    __tablename__ = "track_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("track.id"), nullable=False, index=True)
    old_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    new_status: Mapped[str] = mapped_column(String(32), nullable=False)
    old_industry_phase: Mapped[str | None] = mapped_column(String(32), nullable=True)
    new_industry_phase: Mapped[str | None] = mapped_column(String(32), nullable=True)
    old_market_phase: Mapped[str | None] = mapped_column(String(32), nullable=True)
    new_market_phase: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


# 本地 SQLite 是长期演进出来的，不像线上 PG 有独立迁移脚本，缺列只能在启动时补。
TRACK_ADDED_COLUMNS = {
    "current_view": "ALTER TABLE track ADD COLUMN current_view TEXT",
    "confidence_level": "ALTER TABLE track ADD COLUMN confidence_level VARCHAR(32)",
    "industry_phase": "ALTER TABLE track ADD COLUMN industry_phase VARCHAR(32)",
    "market_phase": "ALTER TABLE track ADD COLUMN market_phase VARCHAR(32)",
    "latest_snapshot_id": "ALTER TABLE track ADD COLUMN latest_snapshot_id INTEGER",
}
TRACK_STATUS_HISTORY_ADDED_COLUMNS = {
    "old_industry_phase": "ALTER TABLE track_status_history ADD COLUMN old_industry_phase VARCHAR(32)",
    "new_industry_phase": "ALTER TABLE track_status_history ADD COLUMN new_industry_phase VARCHAR(32)",
    "old_market_phase": "ALTER TABLE track_status_history ADD COLUMN old_market_phase VARCHAR(32)",
    "new_market_phase": "ALTER TABLE track_status_history ADD COLUMN new_market_phase VARCHAR(32)",
    "changed_by": "ALTER TABLE track_status_history ADD COLUMN changed_by VARCHAR(32) NOT NULL DEFAULT 'manual'",
}


def ensure_track_discovery_schema(engine: Engine) -> None:
    for table in (TrackMaterial.__table__, TrackTrendSnapshot.__table__):
        for index in table.indexes:
            index.create(bind=engine, checkfirst=True)

    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        track_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(track)")).all()}
        for column, statement in TRACK_ADDED_COLUMNS.items():
            if column not in track_columns:
                conn.execute(text(statement))

        history_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(track_status_history)")).all()}
        for column, statement in TRACK_STATUS_HISTORY_ADDED_COLUMNS.items():
            if column not in history_columns:
                conn.execute(text(statement))
