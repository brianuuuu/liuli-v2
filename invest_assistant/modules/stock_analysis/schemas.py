from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class StockPoolCreate(BaseModel):
    stock_id: int
    status: str = "watching"


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
