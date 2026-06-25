from datetime import date, datetime
from pathlib import Path
import shutil

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
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
    cost_price: Mapped[float | None] = mapped_column(Float, nullable=True)
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
        cost_price_is_required = bool(columns.get("cost_price") and columns["cost_price"][3])
        if needs_change or cost_price_is_required:
            _backup_sqlite_database(engine)
        for name, ddl in missing_alters.items():
            if name not in columns:
                conn.execute(text(ddl))
        if cost_price_is_required:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(text("ALTER TABLE portfolio_position RENAME TO portfolio_position_old"))
            PortfolioPosition.__table__.create(bind=conn)
            conn.execute(
                text(
                    """
                    INSERT INTO portfolio_position (
                        id, portfolio_id, group_id, stock_id, quantity, cost_price,
                        current_price, previous_close, market_value, quote_time,
                        price_source, target_weight, note, status, created_at, updated_at
                    )
                    SELECT
                        id, portfolio_id, group_id, stock_id, quantity, cost_price,
                        current_price, previous_close, market_value, quote_time,
                        price_source, target_weight, note, status, created_at, updated_at
                    FROM portfolio_position_old
                    """
                )
            )
            conn.execute(text("DROP TABLE portfolio_position_old"))
            conn.execute(text("PRAGMA foreign_keys=ON"))


def _backup_sqlite_database(engine: Engine) -> None:
    database_path = Path(str(engine.url.database or ""))
    if not database_path or database_path.name != "liuli.sqlite3" or not database_path.exists():
        return
    recovery_dir = database_path.parent / "recovery"
    recovery_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(database_path, recovery_dir / f"liuli-before-portfolio-schema-{stamp}.sqlite3")
