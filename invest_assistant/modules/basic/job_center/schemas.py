from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class JobConfigRead(BaseModel):
    id: int
    job_name: str
    module_name: str
    display_name: str
    description: str
    trigger_type: str
    cron_expr: str | None = None
    enabled: bool
    timeout_seconds: int
    max_retries: int
    params_schema: dict[str, Any] | None = None
    last_run_at: datetime | None = None
    last_status: str | None = None
    next_run_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class JobConfigUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    trigger_type: str | None = None
    cron_expr: str | None = None
    enabled: bool | None = None
    timeout_seconds: int | None = None
    max_retries: int | None = None


class JobRunCreate(BaseModel):
    params: dict[str, Any] = {}


class JobRunRequestRead(BaseModel):
    id: int
    job_name: str
    params_json: str | None = None
    status: str
    requested_by: int | None = None
    requested_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None

    model_config = ConfigDict(from_attributes=True)


class JobRunLogRead(BaseModel):
    id: int
    job_name: str
    module_name: str
    trigger_type: str
    status: str
    params_json: str | None = None
    result_json: str | None = None
    started_at: datetime
    finished_at: datetime
    duration_ms: int
    fetched_count: int
    processed_count: int
    inserted_count: int
    updated_count: int
    error_message: str | None = None

    model_config = ConfigDict(from_attributes=True)
