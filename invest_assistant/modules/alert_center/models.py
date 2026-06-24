from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.time_utils import utc_now


class AlertRule(Base):
    __tablename__ = "alert_rule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    condition_json: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class AlertEvent(Base):
    __tablename__ = "alert_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("alert_rule.id"), nullable=True, index=True)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    event_level: Mapped[str] = mapped_column(String(32), nullable=False, default="info")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unread")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


def ensure_alert_center_schema(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    if "alert_rule" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("alert_rule")}
    with engine.begin() as conn:
        if "name" not in columns:
            conn.execute(text("ALTER TABLE alert_rule ADD COLUMN name VARCHAR(128) NOT NULL DEFAULT ''"))
        if "status" not in columns:
            conn.execute(text("ALTER TABLE alert_rule ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active'"))
        conn.execute(
            text(
                """
                UPDATE alert_rule
                SET name = CASE
                    WHEN rule_type = 'job_failure' AND target_type = 'job_center' THEN '任务中心失败报警'
                    ELSE '预警规则 #' || id
                END
                WHERE name IS NULL OR trim(name) = ''
                """
            )
        )
        conn.execute(text("UPDATE alert_rule SET status = 'active' WHERE status IS NULL OR trim(status) = ''"))
