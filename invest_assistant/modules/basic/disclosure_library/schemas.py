from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CompanyDisclosureCreate(BaseModel):
    stock_id: int | None = None
    source: str
    disclosure_type: str
    title: str
    publish_time: datetime | None = None
    report_period: str | None = None
    source_url: str | None = None
    file_path: str | None = None
    parsed_text_path: str | None = None
    parsed_markdown_path: str | None = None
    parse_status: str = "pending"


class CompanyDisclosureUpdate(BaseModel):
    stock_id: int | None = None
    source: str | None = None
    disclosure_type: str | None = None
    title: str | None = None
    publish_time: datetime | None = None
    report_period: str | None = None
    source_url: str | None = None
    file_path: str | None = None
    parsed_text_path: str | None = None
    parsed_markdown_path: str | None = None
    parse_status: str | None = None


class CompanyDisclosureRead(CompanyDisclosureCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
