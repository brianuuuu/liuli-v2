from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TagCreate(BaseModel):
    name: str
    type: str | None = None
    source: str | None = None
    status: str = "active"


class TagUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    source: str | None = None
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
    is_important: bool = False
    author: str | None = None


class SentimentImportItem(BaseModel):
    """MCP 舆情导入的单条输入。字段只做类型约束，取值校验在服务层逐条做，一条不合法不拖垮整批。"""

    platform: str = Field(description="平台：雪球 / 微博 / 知乎")
    author: str = Field(description="作者名，按平台上的显示名原样填写")
    date: str = Field(description="发布日期 YYYY-MM-DD，只要日期")
    content: str = Field(description="观点正文，纯文本，最长 2000 字")
    important: bool = Field(default=False, description="是否值得重点关注，标记后进入“重要”")


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
    rank_no: int
    created_at: datetime
    tag: TagRead | None = None

    model_config = ConfigDict(from_attributes=True)


class TagBindingCreate(BaseModel):
    name: str
    source: str | None = "manual"
    status: str = "active"


class TagBindingRead(BaseModel):
    id: int
    tag: TagRead
    source: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class AiTagSuggestionCreate(BaseModel):
    suggested_text: str
    final_tag_name: str | None = None
    score: float | None = None
    reason: str | None = None
    status: str = "pending"
    rejected_count: int = 0
    final_tag_id: int | None = None
    ext_json: str = "{}"


class AiTagSuggestionApprove(BaseModel):
    final_tag_name: str | None = None
    target_type: str
    target_id: int | None = None
    target_name: str | None = None


class AiTagSuggestionRead(AiTagSuggestionCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HotwordCreate(BaseModel):
    name: str
    description: str | None = None
    status: str = "active"


class HotwordRead(HotwordCreate):
    id: int
    tags: list[TagBindingRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
