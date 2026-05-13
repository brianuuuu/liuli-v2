from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TrackThesisCreate(BaseModel):
    title: str
    core_thesis: str
    underlying_change: str | None = None
    old_bottleneck: str | None = None
    new_solution: str | None = None
    value_chain_shift: str | None = None
    time_horizon: str | None = None
    confidence_level: str | None = None
    status: str = "watching"


class TrackThesisUpdate(BaseModel):
    title: str | None = None
    core_thesis: str | None = None
    underlying_change: str | None = None
    old_bottleneck: str | None = None
    new_solution: str | None = None
    value_chain_shift: str | None = None
    time_horizon: str | None = None
    confidence_level: str | None = None
    status: str | None = None


class TrackThesisRead(TrackThesisCreate):
    id: int
    user_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackValidationIndicatorCreate(BaseModel):
    name: str
    indicator_type: str | None = None
    data_source: str | None = None
    current_value: str | None = None
    direction: str | None = None
    validation_meaning: str | None = None


class TrackValidationIndicatorRead(TrackValidationIndicatorCreate):
    id: int
    thesis_id: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackEvidenceCreate(BaseModel):
    source_item_id: int | None = None
    evidence_direction: str
    evidence_strength: float = 0
    summary: str | None = None
    affected_segments: str | None = None
    related_stock_ids: str | None = None


class TrackEvidenceRead(TrackEvidenceCreate):
    id: int
    thesis_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackRelatedStockCreate(BaseModel):
    stock_id: int
    role: str | None = None
    relevance_score: float = 0
    evidence_count: int = 0
    heat_score: float = 0
    status: str = "candidate"


class TrackRelatedStockRead(TrackRelatedStockCreate):
    id: int
    thesis_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackStatusChange(BaseModel):
    new_status: str
    reason: str | None = None


class TrackStatusHistoryRead(BaseModel):
    id: int
    thesis_id: int
    old_status: str | None = None
    new_status: str
    reason: str | None = None
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)
