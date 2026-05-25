from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    type: str
    status: str = "active"
    source: str | None = None


class TagUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    status: str | None = None
    source: str | None = None


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
    related_type: str | None = None
    related_id: int | None = None


class MarketFlashSyncCreate(BaseModel):
    limit: int = 100


class MarketFlashSyncResult(BaseModel):
    success: bool
    message: str = ""
    fetched_count: int = 0
    inserted_count: int = 0
    skipped_count: int = 0


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


class SourceItemRead(SourceItemCreate):
    id: int
    created_at: datetime
    source_tags: list[SourceTagRead] = []

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


class AiTagSuggestionCreate(BaseModel):
    suggested_text: str
    final_tag_name: str | None = None
    score: float = 0
    reason: str | None = None
    final_tag_id: int | None = None
    ext_json: str | None = None
    status: str = "pending"


class AiTagSuggestionApprove(BaseModel):
    final_tag_name: str | None = None


class AiTagSuggestionRead(AiTagSuggestionCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HotwordTagRelationCreate(BaseModel):
    tag_id: int
    source: str = "manual"
    status: str = "active"


class HotwordTagRelationRead(HotwordTagRelationCreate):
    id: int
    hotword_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HotwordCreate(BaseModel):
    name: str
    description: str | None = None
    status: str = "active"


class HotwordRead(BaseModel):
    hotword: dict
    tag_relations: list[HotwordTagRelationRead]
