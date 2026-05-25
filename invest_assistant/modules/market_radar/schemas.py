from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    type: str
    stock_id: int | None = None
    track_id: int | None = None
    status: str = "active"


class TagUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    stock_id: int | None = None
    track_id: int | None = None
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


class TagCandidateCreate(BaseModel):
    name: str
    suggested_type: str
    source_item_id: int | None = None
    trigger_text: str | None = None
    confidence: float = 0
    reason: str | None = None
    target_tag_id: int | None = None
    suggested_target_tag_id: int | None = None
    merge_similarity: float | None = None
    merge_reason: str | None = None
    status: str = "pending"


class TagCandidateMerge(BaseModel):
    target_tag_id: int | None = None
    name: str | None = None


class TagCandidateApprove(BaseModel):
    name: str | None = None


class TagCandidateRead(TagCandidateCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HotwordAliasCreate(BaseModel):
    alias: str
    source: str = "manual"
    status: str = "active"


class HotwordAliasRead(HotwordAliasCreate):
    id: int
    tag_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HotwordCreate(BaseModel):
    name: str
    aliases: list[str] = []
    status: str = "active"


class HotwordRead(BaseModel):
    tag: TagRead
    aliases: list[HotwordAliasRead]
