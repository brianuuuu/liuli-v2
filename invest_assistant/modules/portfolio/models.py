from datetime import date, datetime
from pathlib import Path
import shutil

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import text

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class Portfolio(Base):
    __tablename__ = "portfolio"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(16), nullable=False, default="CNY")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class PortfolioGroup(Base):
    __tablename__ = "portfolio_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolio.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    group_type: Mapped[str] = mapped_column(String(32), nullable=False, default="custom")
    target_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_stock_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class PortfolioPosition(Base):
    __tablename__ = "portfolio_position"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolio.id"), nullable=False, index=True)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("portfolio_group.id"), nullable=True, index=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    previous_close: Mapped[float | None] = mapped_column(Float, nullable=True)
    market_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    quote_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    price_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class PortfolioPositionChange(Base):
    """调仓记录：记个股数量的变动、调仓价格和理由来源，不记费用，现金由现金校准单独维护。"""

    __tablename__ = "portfolio_position_change"
    __table_args__ = (
        Index("ix_portfolio_position_change_portfolio_id", "portfolio_id"),
        Index("ix_portfolio_position_change_change_date", "change_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolio.id"), nullable=False)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False, index=True)
    quantity_before: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    quantity_after: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    quantity_delta: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    change_date: Mapped[date] = mapped_column(Date, nullable=False)
    # 手填为 manual；留空时按调仓日收盘价估算为 estimated；公司行为不估价，两列都为空
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # ai_advice / personal / fund_allocation / corporate_action / other，老记录为空
    reason_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 关联的微操建议条目；建议条目随回流记录可能被删，只存 ID 不建外键
    advice_item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class PortfolioReview(Base):
    __tablename__ = "portfolio_review"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolio.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    risk_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class PortfolioCashBalance(Base):
    __tablename__ = "portfolio_cash_balance"
    __table_args__ = (
        UniqueConstraint("portfolio_id", name="uq_portfolio_cash_balance_portfolio_id"),
        Index("ix_portfolio_cash_balance_portfolio_id", "portfolio_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolio.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(16), nullable=False, default="CNY")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class PortfolioCashFlow(Base):
    __tablename__ = "portfolio_cash_flow"
    __table_args__ = (
        Index("ix_portfolio_cash_flow_portfolio_id", "portfolio_id"),
        Index("ix_portfolio_cash_flow_flow_date", "flow_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolio.id"), nullable=False)
    flow_type: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(16), nullable=False, default="CNY")
    flow_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class PortfolioValueSnapshot(Base):
    __tablename__ = "portfolio_value_snapshot"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "snapshot_date", name="uq_portfolio_value_snapshot_portfolio_date"),
        Index("ix_portfolio_value_snapshot_portfolio_id", "portfolio_id"),
        Index("ix_portfolio_value_snapshot_snapshot_date", "snapshot_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolio.id"), nullable=False)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_value: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    position_market_value: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    cash_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    day_pnl: Mapped[float | None] = mapped_column(Float, nullable=True)
    day_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    position_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="scheduled")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class PortfolioAdjustAdvice(Base):
    """微操报告：一份研究回流报告一条，导入后只改 status。"""

    __tablename__ = "portfolio_adjust_advice"
    __table_args__ = (
        UniqueConstraint("feedback_id", name="uq_portfolio_adjust_advice_feedback_id"),
        Index("ix_portfolio_adjust_advice_portfolio_id", "portfolio_id"),
        Index("ix_portfolio_adjust_advice_target_trade_date", "target_trade_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # 为空表示全部实盘组合：微操研究员看的是所有账户合在一起的持仓
    portfolio_id: Mapped[int | None] = mapped_column(ForeignKey("portfolio.id"), nullable=True)
    # 回流记录和预警都允许用户删除，这两处只存 ID 不建外键，免得 PostgreSQL 拦下删除
    feedback_id: Mapped[int] = mapped_column(Integer, nullable=False)
    report_id: Mapped[int | None] = mapped_column(ForeignKey("report.id"), nullable=True)
    researcher_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    data_as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    news_as_of: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 适用交易日 T：所有事后评估都从这一天起数交易日
    target_trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    has_opportunity: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    total_asset: Mapped[float | None] = mapped_column(Float, nullable=True)
    cash: Mapped[float | None] = mapped_column(Float, nullable=True)
    cash_ratio_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    cash_ratio_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    continuity_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # active / superseded：同组合、同研究员、同 T 重新导入时旧报告作废，统计只算 active
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class PortfolioAdjustAdviceItem(Base):
    """微操报告里逐只持仓的判断。只有查询、统计、评估要用的字段成列，其余原样留在 detail_json，
    profile 的 JSON 结构演进不需要迁移。评估字段由 portfolio.evaluate_adjust_advice 任务回写。"""

    __tablename__ = "portfolio_adjust_advice_item"
    __table_args__ = (
        Index("ix_portfolio_adjust_advice_item_advice_id", "advice_id"),
        Index("ix_portfolio_adjust_advice_item_stock_id", "stock_id"),
        Index("ix_portfolio_adjust_advice_item_primary_signal_code", "primary_signal_code"),
        Index("ix_portfolio_adjust_advice_item_risk_level", "risk_level"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    advice_id: Mapped[int] = mapped_column(ForeignKey("portfolio_adjust_advice.id"), nullable=False)
    stock_id: Mapped[int] = mapped_column(ForeignKey("stock.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    primary_signal_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    value_zone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    long_trend: Mapped[str | None] = mapped_column(String(16), nullable=True)
    bias60_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False, default="none")
    primary_risk_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    alert_event_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail_json: Mapped[str] = mapped_column(Text, nullable=False)

    trigger_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    execution_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    executed_quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    base_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    return_5d: Mapped[float | None] = mapped_column(Float, nullable=True)
    return_20d: Mapped[float | None] = mapped_column(Float, nullable=True)
    return_60d: Mapped[float | None] = mapped_column(Float, nullable=True)
    benchmark_return_20d: Mapped[float | None] = mapped_column(Float, nullable=True)
    verdict: Mapped[str | None] = mapped_column(String(16), nullable=True)
    risk_verdict: Mapped[str | None] = mapped_column(String(16), nullable=True)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def ensure_portfolio_schema(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        table_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='portfolio_position'")
        ).first()
        if table_exists is None:
            return
        columns = {row[1]: row for row in conn.execute(text("PRAGMA table_info(portfolio_position)")).all()}
        missing_alters = {
            "previous_close": "ALTER TABLE portfolio_position ADD COLUMN previous_close FLOAT",
            "quote_time": "ALTER TABLE portfolio_position ADD COLUMN quote_time DATETIME",
            "price_source": "ALTER TABLE portfolio_position ADD COLUMN price_source VARCHAR(64)",
        }
        needs_change = any(name not in columns for name in missing_alters)
        # 系统不关心买入成本，cost_price 已删除（Postgres 见 tools/migrations）；老库可能还是 NOT NULL，留着会让新增持仓插入失败
        has_cost_price = "cost_price" in columns
        change_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(portfolio_position_change)")).all()}
        # 调仓价格与理由来源是后加的列，老库补一次。Postgres 走 tools/migrations 的迁移脚本。
        change_alters = {
            "price": "ALTER TABLE portfolio_position_change ADD COLUMN price FLOAT",
            "price_source": "ALTER TABLE portfolio_position_change ADD COLUMN price_source VARCHAR(16)",
            "reason_type": "ALTER TABLE portfolio_position_change ADD COLUMN reason_type VARCHAR(32)",
            "advice_item_id": "ALTER TABLE portfolio_position_change ADD COLUMN advice_item_id INTEGER",
        }
        missing_change_alters = [ddl for name, ddl in change_alters.items() if change_columns and name not in change_columns]
        if needs_change or has_cost_price or missing_change_alters:
            _backup_sqlite_database(engine)
        for ddl in missing_change_alters:
            conn.execute(text(ddl))
        for name, ddl in missing_alters.items():
            if name not in columns:
                conn.execute(text(ddl))
        if has_cost_price:
            conn.execute(text("ALTER TABLE portfolio_position DROP COLUMN cost_price"))


def _backup_sqlite_database(engine: Engine) -> None:
    database_path = Path(str(engine.url.database or ""))
    if not database_path or database_path.name != "liuli.sqlite3" or not database_path.exists():
        return
    recovery_dir = database_path.parent / "recovery"
    recovery_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(database_path, recovery_dir / f"liuli-before-portfolio-schema-{stamp}.sqlite3")
