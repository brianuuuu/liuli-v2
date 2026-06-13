from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from invest_assistant.bootstrap.database import Base
from invest_assistant.shared.db_types import dumps_json, loads_json
from invest_assistant.shared.time_utils import utc_now


class SystemConfig(Base):
    __tablename__ = "system_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    config_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    config_value: Mapped[str] = mapped_column(Text, nullable=False)
    config_type: Mapped[str] = mapped_column(String(32), nullable=False, default="string")
    module_name: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class RuntimeState(Base):
    __tablename__ = "runtime_state"
    __table_args__ = (UniqueConstraint("namespace", "state_key", name="uq_runtime_state_namespace_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    namespace: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    state_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    state_value: Mapped[str] = mapped_column(Text, nullable=False)
    value_type: Mapped[str] = mapped_column(String(32), nullable=False, default="string")
    _ext_json: Mapped[str] = mapped_column("ext_json", Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    @property
    def ext_json(self) -> dict:
        value = loads_json(self._ext_json)
        return value if isinstance(value, dict) else {}

    @ext_json.setter
    def ext_json(self, value: dict) -> None:
        self._ext_json = dumps_json(value if isinstance(value, dict) else {})
