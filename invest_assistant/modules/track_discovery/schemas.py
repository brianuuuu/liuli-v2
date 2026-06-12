from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


MATERIAL_TYPES = {"source_item", "knowledge_note"}
MATERIAL_DIRECTIONS = {"support", "weaken", "neutral", "noise"}
MATERIAL_IMPORTANCE = {"high", "medium", "low"}
MATERIAL_STATUSES = {"pending", "confirmed", "ignored"}
TRACK_STAGES = {"concept", "validate", "growth", "overheat", "decline"}
CONFIDENCE_LEVELS = {"low", "medium", "high"}


class TrackCreate(BaseModel):
    name: str
    description: str | None = None
    status: str = "candidate"
    track_score: float | None = None
    current_view: str | None = None
    stage: str | None = None
    confidence_level: str | None = None

    @field_validator("stage")
    @classmethod
    def validate_stage(cls, value: str | None) -> str | None:
        if value is not None and value not in TRACK_STAGES:
            raise ValueError("stage must be concept, validate, growth, overheat, or decline")
        return value

    @field_validator("confidence_level")
    @classmethod
    def validate_confidence_level(cls, value: str | None) -> str | None:
        if value is not None and value not in CONFIDENCE_LEVELS:
            raise ValueError("confidence_level must be low, medium, or high")
        return value


class TrackUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    track_score: float | None = None
    current_view: str | None = None
    stage: str | None = None
    confidence_level: str | None = None

    @field_validator("stage")
    @classmethod
    def validate_stage(cls, value: str | None) -> str | None:
        return TrackCreate.validate_stage(value)

    @field_validator("confidence_level")
    @classmethod
    def validate_confidence_level(cls, value: str | None) -> str | None:
        return TrackCreate.validate_confidence_level(value)


class TrackRead(TrackCreate):
    id: int
    tag: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackMaterialCreate(BaseModel):
    material_type: str
    material_id: int
    direction: str | None = None
    importance_level: str | None = None
    status: str = "pending"
    note: str | None = None

    @field_validator("material_type")
    @classmethod
    def validate_material_type(cls, value: str) -> str:
        if value not in MATERIAL_TYPES:
            raise ValueError("material_type must be source_item or knowledge_note")
        return value

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, value: str | None) -> str | None:
        if value is not None and value not in MATERIAL_DIRECTIONS:
            raise ValueError("direction must be support, weaken, neutral, or noise")
        return value

    @field_validator("importance_level")
    @classmethod
    def validate_importance_level(cls, value: str | None) -> str | None:
        if value is not None and value not in MATERIAL_IMPORTANCE:
            raise ValueError("importance_level must be high, medium, or low")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in MATERIAL_STATUSES:
            raise ValueError("status must be pending, confirmed, or ignored")
        return value


class TrackMaterialUpdate(BaseModel):
    direction: str | None = None
    importance_level: str | None = None
    status: str | None = None
    note: str | None = None

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, value: str | None) -> str | None:
        return TrackMaterialCreate.validate_direction(value)

    @field_validator("importance_level")
    @classmethod
    def validate_importance_level(cls, value: str | None) -> str | None:
        return TrackMaterialCreate.validate_importance_level(value)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None:
            TrackMaterialCreate.validate_status(value)
        return value


class TrackMaterialRead(TrackMaterialCreate):
    id: int
    track_id: int
    track_name: str | None = None
    material_title: str | None = None
    material_summary: str | None = None
    material_source_name: str | None = None
    material_url: str | None = None
    material_time: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackStatusChange(BaseModel):
    new_status: str
    new_stage: str | None = None
    reason: str | None = None
    changed_by: str = "manual"

    @field_validator("new_stage")
    @classmethod
    def validate_new_stage(cls, value: str | None) -> str | None:
        return TrackCreate.validate_stage(value)


class TrackStatusHistoryRead(BaseModel):
    id: int
    track_id: int
    old_status: str | None = None
    new_status: str
    old_stage: str | None = None
    new_stage: str | None = None
    reason: str | None = None
    changed_by: str
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackAnalysisSnapshotCreate(BaseModel):
    analysis_date: date
    market_space: str | None = None
    market_size: str | None = None
    growth_rate: str | None = None
    heat_summary: str | None = None
    ai_summary: str | None = None
    opportunity_points: str | None = None
    risk_points: str | None = None
    watch_signals: str | None = None
    score: float | None = None
    confidence_level: str | None = None

    @field_validator("confidence_level")
    @classmethod
    def validate_confidence_level(cls, value: str | None) -> str | None:
        return TrackCreate.validate_confidence_level(value)


class TrackAnalysisSnapshotRead(TrackAnalysisSnapshotCreate):
    id: int
    track_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackDetailSummary(BaseModel):
    tag_count: int = 0
    material_count: int = 0
    pending_material_count: int = 0
    high_importance_material_count: int = 0
    bound_stock_count: int = 0
    latest_heat_score: float | None = None
    last_updated_at: datetime | None = None


class TrackDetailHeatPoint(BaseModel):
    stat_time: datetime
    heat_score: float
    trigger_count: int
    source_count: int
    rank_no: int | None = None


class TrackDetailHeatTrend(BaseModel):
    window_type: str
    points: list[TrackDetailHeatPoint] = Field(default_factory=list)


class TrackDetailStockRelation(BaseModel):
    id: int
    stock_id: int
    track_id: int
    stock_name: str | None = None
    stock_code: str | None = None
    symbol: str | None = None
    relation_type: str | None = None
    conviction: float
    reason: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class TrackDetailRead(BaseModel):
    track: TrackRead
    summary: TrackDetailSummary
    heat_trends: list[TrackDetailHeatTrend] = Field(default_factory=list)
    latest_snapshot: TrackAnalysisSnapshotRead | None = None
    analysis_snapshots: list[TrackAnalysisSnapshotRead] = Field(default_factory=list)
    materials: list[TrackMaterialRead] = Field(default_factory=list)
    stocks: list[TrackDetailStockRelation] = Field(default_factory=list)
    tags: list[dict] = Field(default_factory=list)
