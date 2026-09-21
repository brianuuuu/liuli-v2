from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
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

    结论层是六维量化评分：六个 0—10 分 + 派生的综合分、评级、热度档位。口径和阈值在
    scoring.py，派生列由 service 在写入时算好，不接受调用方传值。
    """

    __tablename__ = "track_trend_snapshot"
    __table_args__ = (Index("ix_track_trend_snapshot_track_date", "track_id", "research_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(ForeignKey("track.id"), nullable=False, index=True)
    research_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    researcher_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    report_id: Mapped[int | None] = mapped_column(ForeignKey("report.id"), nullable=True, index=True)

    # 六维评分，全部 0—10 且一律"分高=更有利"：周期韧性 10=弱周期穿越周期，
    # 行业集中度 10=格局收敛龙头有定价权。读反了平均分就没有意义，见 scoring.py。
    market_heat_score: Mapped[float] = mapped_column(Float, nullable=False)
    growth_speed_score: Mapped[float] = mapped_column(Float, nullable=False)
    concentration_score: Mapped[float] = mapped_column(Float, nullable=False)
    cycle_resilience_score: Mapped[float] = mapped_column(Float, nullable=False)
    current_market_size_score: Mapped[float] = mapped_column(Float, nullable=False)
    future_market_size_score: Mapped[float] = mapped_column(Float, nullable=False)

    # 派生列：六项平均、综合分评级、资金热度档位。冗余存一份是为了看板按评级筛选排序
    # 走 SQL，不用把全部快照捞进内存再算。写入路径统一由 scoring.derive_track_scores 生成。
    overall_score: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    track_grade: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    heat_tier: Mapped[str] = mapped_column(String(4), nullable=False, index=True)

    # 卡片副标题：本次判断的主导周期。强度已由评级承接，这里只说"结论站在哪个时间尺度"。
    headline_cycle: Mapped[str] = mapped_column(String(16), nullable=False)
    core_judgment: Mapped[str | None] = mapped_column(Text, nullable=True)

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


# 六维评分上线前的列，靠它判断本地 track_trend_snapshot 是不是旧结构。
LEGACY_TRACK_TREND_COLUMN = "headline_strength"


def _rebuild_legacy_track_trend_snapshot(engine: Engine) -> None:
    """本地 SQLite 的旧快照表直接重建。

    旧表的 headline_strength 是 NOT NULL，新代码不再写这一列，留着会让每一次插入都失败；
    SQLite 又不能逐列 DROP，只能整表重建。表里一旦有数据就报错中止：那批研究结论没有
    六维评分，重建等于丢掉，去向要人来定，不在启动路径上静默处理。

    删表和建表在同一个事务里：分成两个事务时，建表失败会留下一个没有快照表的库。
    """
    # report_id 是指向 report 的外键且没写死类型，建表时要从 report 列上取。
    # report 表没进 metadata 时，SQLAlchemy 只能拿到 NullType 并直接拒绝生成 DDL。
    import invest_assistant.modules.basic.report_library.models  # noqa: F401

    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(track_trend_snapshot)")).all()}
        if not columns or LEGACY_TRACK_TREND_COLUMN not in columns:
            return
        rows = int(conn.execute(text("SELECT count(*) FROM track_trend_snapshot")).scalar() or 0)
        if rows:
            raise RuntimeError(
                f"track_trend_snapshot 还是六维评分之前的旧结构，且有 {rows} 行数据。"
                "重建会丢掉这些研究结论，已中止。请先导出或迁移这批数据再启动。"
            )
        conn.execute(text("DROP TABLE track_trend_snapshot"))
        TrackTrendSnapshot.__table__.create(bind=conn)


def ensure_track_discovery_schema(engine: Engine) -> None:
    if engine.dialect.name == "sqlite":
        _rebuild_legacy_track_trend_snapshot(engine)

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
