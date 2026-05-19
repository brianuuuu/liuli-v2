from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class StockPoolCreate(BaseModel):
    stock_id: int
    status: str = "watching"
    source: str = "manual"
    reason: str | None = None


class StockPoolRead(StockPoolCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StockResearchNoteCreate(BaseModel):
    note_type: str
    title: str
    content: str
    related_track_id: int | None = None


class StockResearchNoteRead(StockResearchNoteCreate):
    id: int
    stock_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StockScoreSnapshotCreate(BaseModel):
    score_date: date
    track_id: int | None = None
    growth_score: float = 0
    valuation_score: float = 0
    moat_score: float = 0
    risk_score: float = 0
    total_score: float = 0


class StockScoreSnapshotRead(StockScoreSnapshotCreate):
    id: int
    stock_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StockCompareGroupCreate(BaseModel):
    name: str
    track_id: int | None = None
    stock_ids: str
    description: str | None = None


class StockCompareGroupRead(StockCompareGroupCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StockTrackRelationCreate(BaseModel):
    track_id: int
    relation_type: str | None = None
    conviction: float = 0
    reason: str | None = None
    status: str = "active"


class TrackStockRelationCreate(BaseModel):
    stock_id: int
    relation_type: str | None = None
    conviction: float = 0
    reason: str | None = None
    status: str = "active"


class StockTrackRelationUpdate(BaseModel):
    relation_type: str | None = None
    conviction: float | None = None
    reason: str | None = None
    status: str | None = None


class StockTrackRelationRead(StockTrackRelationCreate):
    id: int
    stock_id: int
    track: dict | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


StockTrackTagBindingCreate = StockTrackRelationCreate
TrackTagStockBindingCreate = TrackStockRelationCreate
StockTrackTagBindingUpdate = StockTrackRelationUpdate
StockTrackTagBindingRead = StockTrackRelationRead
