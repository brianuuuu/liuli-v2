from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    type: str
    category: str | None = None
    stock_id: int | None = None
    status: str = "active"


class TagUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    category: str | None = None
    stock_id: int | None = None
    status: str | None = None


class TagRead(TagCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SourceItemCreate(BaseModel):
    source_type: str
    source_name: str
    title: str
    content: str
    source_url: str | None = None
    publish_time: datetime | None = None


class SourceItemRead(SourceItemCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SourceTagRead(BaseModel):
    id: int
    source_item_id: int
    tag_id: int
    trigger_text: str | None = None
    confidence: float
    extractor: str
    created_at: datetime
    tag: TagRead | None = None

    model_config = ConfigDict(from_attributes=True)


class TagHeatRead(BaseModel):
    id: int
    tag_id: int
    window_type: str
    stat_time: datetime
    trigger_count: int
    source_count: int
    heat_score: float
    avg_count: float
    change_ratio: float
    rank_no: int
    created_at: datetime
    tag: TagRead | None = None

    model_config = ConfigDict(from_attributes=True)


class TagCandidateCreate(BaseModel):
    name: str
    suggested_type: str
    category: str | None = None
    source_item_id: int | None = None
    confidence: float = 0
    reason: str | None = None
    status: str = "pending"


class TagCandidateRead(TagCandidateCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
