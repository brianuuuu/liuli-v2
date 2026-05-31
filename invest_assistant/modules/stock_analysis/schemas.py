from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class StockPoolCreate(BaseModel):
    stock_id: int
    status: str = "candidate"
    source: str = "manual"
    reason: str | None = None
    track_ids: list[int] = Field(default_factory=list)


class StockPoolRead(StockPoolCreate):
    id: int
    symbol: str | None = None
    stock_code: str | None = None
    stock_name: str | None = None
    tracks: list[dict] = Field(default_factory=list)
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


class StockScoreComparisonRead(BaseModel):
    stock_id: int
    symbol: str | None = None
    stock_code: str | None = None
    stock_name: str | None = None
    status: str | None = None
    tracks: list[dict] = Field(default_factory=list)
    score_id: int | None = None
    score_date: date | None = None
    track_id: int | None = None
    growth_score: float | None = None
    valuation_score: float | None = None
    moat_score: float | None = None
    risk_score: float | None = None
    total_score: float | None = None
    created_at: datetime | None = None


class StockValuationComparisonRead(BaseModel):
    stock_id: int
    symbol: str | None = None
    stock_code: str | None = None
    stock_name: str | None = None
    status: str | None = None
    tracks: list[dict] = Field(default_factory=list)
    valuation_id: int | None = None
    company: str | None = None
    company_code: str | None = None
    report_period: str | None = None
    report_release_date: date | None = None
    current_market_value: float | None = None
    financial_performance_json: str | None = None
    trend_reference_json: str | None = None
    guidance_check_json: str | None = None
    quarter_performance: str | None = None
    quarter_main_reason: str | None = None
    profit_model_json: str | None = None
    fcf_model_json: str | None = None
    revenue_model_json: str | None = None
    primary_model: str | None = None
    expected_market_value_3y: float | None = None
    expectation_gap_rate: float | None = None
    analysis_date: date | None = None
    researcher: str | None = None
    created_at: datetime | None = None


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


class StockMaterialCreate(BaseModel):
    material_type: str
    material_id: int
    impact_direction: str | None = None
    importance_level: str | None = None
    status: str = "pending"
    note: str | None = None


class StockMaterialUpdate(BaseModel):
    impact_direction: str | None = None
    importance_level: str | None = None
    status: str | None = None
    note: str | None = None


class StockMaterialRead(StockMaterialCreate):
    id: int
    stock_id: int
    material_title: str | None = None
    material_summary: str | None = None
    material_source_name: str | None = None
    material_url: str | None = None
    material_time: datetime | str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

