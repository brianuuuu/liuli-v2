from pydantic import BaseModel, Field


class LimitOffsetParams(BaseModel):
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class SourceItemSearchParams(LimitOffsetParams):
    q: str | None = None
    source_name: str | None = None
    source_type: str | None = None
    important_only: bool = False
    tag_id: int | None = None


class HotwordParams(LimitOffsetParams):
    status: str | None = None
    q: str | None = None
