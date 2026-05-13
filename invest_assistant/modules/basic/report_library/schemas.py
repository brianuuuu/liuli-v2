from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReportCreate(BaseModel):
    title: str
    report_type: str
    source_module: str
    target_type: str | None = None
    target_id: int | None = None
    summary: str | None = None
    file_format: str = "md"
    file_path: str
    generated_by: str = "manual"
    status: str = "draft"
    publish_time: datetime | None = None


class ReportUpdate(BaseModel):
    title: str | None = None
    report_type: str | None = None
    source_module: str | None = None
    target_type: str | None = None
    target_id: int | None = None
    summary: str | None = None
    file_format: str | None = None
    file_path: str | None = None
    generated_by: str | None = None
    status: str | None = None
    publish_time: datetime | None = None


class ReportRead(ReportCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
