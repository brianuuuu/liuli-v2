from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

TriggerType = Literal["schedule", "manual", "both"]


@dataclass
class JobResult:
    success: bool
    message: str = ""
    fetched_count: int = 0
    processed_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    extra: dict | None = None


@dataclass
class JobDefinition:
    job_name: str
    module_name: str
    display_name: str
    description: str
    handler: Callable[..., Any]
    trigger_type: TriggerType = "manual"
    cron_expr: str | None = None
    enabled: bool = True
    timeout_seconds: int = 300
    max_retries: int = 0
    params_schema: dict | None = None
    tags: list[str] | None = None
