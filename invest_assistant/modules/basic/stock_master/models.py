from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class Stock(Base):
    __tablename__ = "stock"
    __table_args__ = (UniqueConstraint("stock_code", "exchange", name="uq_stock_code_exchange"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    stock_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    stock_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    name_pinyin: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)
    name_abbr: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    market: Mapped[str | None] = mapped_column(String(64), nullable=True)
    exchange: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


def ensure_stock_master_schema(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(stock)")).all()}
        additions = {
            "symbol": "ALTER TABLE stock ADD COLUMN symbol VARCHAR(32)",
            "name_pinyin": "ALTER TABLE stock ADD COLUMN name_pinyin VARCHAR(256)",
            "name_abbr": "ALTER TABLE stock ADD COLUMN name_abbr VARCHAR(64)",
        }
        for column, statement in additions.items():
            if column not in columns:
                conn.execute(text(statement))
