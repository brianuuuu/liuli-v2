from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.db_types import dumps_json, loads_json
from invest_assistant.shared.time_utils import utc_now


class JobConfig(Base):
    __tablename__ = "job_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    module_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    _config_json: Mapped[str] = mapped_column("config_json", Text, nullable=False, default="{}")
    _ext_json: Mapped[str] = mapped_column("ext_json", Text, nullable=False, default="{}")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    @property
    def config_json(self) -> dict:
        value = loads_json(self._config_json)
        return value if isinstance(value, dict) else {}

    @config_json.setter
    def config_json(self, value: dict) -> None:
        self._config_json = dumps_json(value if isinstance(value, dict) else {})

    @property
    def ext_json(self) -> dict:
        value = loads_json(self._ext_json)
        return value if isinstance(value, dict) else {}

    @ext_json.setter
    def ext_json(self, value: dict) -> None:
        self._ext_json = dumps_json(value if isinstance(value, dict) else {})


class JobRunRequest(Base):
    __tablename__ = "job_run_request"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    params_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    requested_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class JobRunLog(Base):
    __tablename__ = "job_run_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    module_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    params_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fetched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inserted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


def ensure_job_center_schema(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(job_config)")).all()}
        if "config_json" not in columns:
            conn.execute(text("ALTER TABLE job_config ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}'"))
            columns.add("config_json")
        if "ext_json" not in columns:
            conn.execute(text("ALTER TABLE job_config ADD COLUMN ext_json TEXT NOT NULL DEFAULT '{}'"))
        if "runtime_config_json" in columns:
            conn.execute(
                text(
                    "UPDATE job_config SET config_json = runtime_config_json "
                    "WHERE (config_json IS NULL OR config_json = '{}') "
                    "AND runtime_config_json IS NOT NULL AND runtime_config_json != '{}'"
                )
            )
