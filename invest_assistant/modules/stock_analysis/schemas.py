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


class StockDashboardTopScoreStock(BaseModel):
    stock_id: int
    stock_name: str | None = None
    stock_code: str | None = None
    total_score: float | None = None


class StockDashboardSummary(BaseModel):
    pool_count: int
    focused_count: int
    pending_materials_count: int
    top_score_stock: StockDashboardTopScoreStock | None = None


class StockDashboardScorePoint(BaseModel):
    score_date: date
    total_score: float
    growth_score: float | None = None
    valuation_score: float | None = None
    moat_score: float | None = None
    risk_score: float | None = None


class StockDashboardScoreTrend(BaseModel):
    stock_id: int
    stock_name: str | None = None
    stock_code: str | None = None
    points: list[StockDashboardScorePoint] = Field(default_factory=list)


class StockDashboardValuationPoint(BaseModel):
    analysis_date: date
    report_period: str | None = None
    current_market_value: float | None = None
    expected_market_value_3y: float | None = None
    expectation_gap_rate: float | None = None


class StockDashboardValuationTrend(BaseModel):
    stock_id: int
    stock_name: str | None = None
    stock_code: str | None = None
    points: list[StockDashboardValuationPoint] = Field(default_factory=list)


class StockDashboardLatestValuation(BaseModel):
    stock_id: int
    stock_name: str | None = None
    stock_code: str | None = None
    report_period: str | None = None
    current_market_value: float | None = None
    quarter_performance: str | None = None
    primary_model: str | None = None
    expected_market_value_3y: float | None = None
    expectation_gap_rate: float | None = None
    analysis_date: date | None = None
    researcher: str | None = None


class StockDashboardScoreRanking(BaseModel):
    rank: int
    stock_id: int
    stock_name: str | None = None
    stock_code: str | None = None
    status: str | None = None
    tracks: list[dict] = Field(default_factory=list)
    score_date: date | None = None
    growth_score: float | None = None
    valuation_score: float | None = None
    moat_score: float | None = None
    risk_score: float | None = None
    total_score: float | None = None


class StockDashboardFocusStock(BaseModel):
    stock_id: int
    stock_name: str | None = None
    stock_code: str | None = None
    status: str
    reason: str | None = None
    tracks: list[dict] = Field(default_factory=list)
    latest_score: float | None = None
    bound_track_count: int
    recent_material_count: int


class StockDashboardMaterial(StockMaterialRead):
    stock_name: str | None = None
    stock_code: str | None = None


class StockDashboardValuationSummary(BaseModel):
    report_period: str | None = None
    current_market_value: float | None = None
    quarter_performance: str | None = None
    primary_model: str | None = None
    expected_market_value_3y: float | None = None
    expectation_gap_rate: float | None = None
    analysis_date: date | None = None
    researcher: str | None = None


class StockDashboardNoteSummary(BaseModel):
    id: int
    note_type: str
    title: str
    content: str
    related_track_id: int | None = None
    updated_at: datetime | None = None


class StockDashboardSelectedStockSummary(BaseModel):
    stock_id: int
    stock_name: str | None = None
    stock_code: str | None = None
    status: str | None = None
    reason: str | None = None
    tracks: list[dict] = Field(default_factory=list)
    latest_score: StockDashboardScorePoint | None = None
    latest_valuation: StockDashboardValuationSummary | None = None
    latest_note: StockDashboardNoteSummary | None = None
    recent_materials: list[StockDashboardMaterial] = Field(default_factory=list)


class StockDashboardRead(BaseModel):
    summary: StockDashboardSummary
    score_trends: list[StockDashboardScoreTrend] = Field(default_factory=list)
    valuation_trends: list[StockDashboardValuationTrend] = Field(default_factory=list)
    score_rankings: list[StockDashboardScoreRanking] = Field(default_factory=list)
    latest_valuations: list[StockDashboardLatestValuation] = Field(default_factory=list)
    focus_stocks: list[StockDashboardFocusStock] = Field(default_factory=list)
    latest_materials: list[StockDashboardMaterial] = Field(default_factory=list)
    pending_materials: list[StockDashboardMaterial] = Field(default_factory=list)
    default_stock_id: int | None = None
    selected_stock_summary: StockDashboardSelectedStockSummary | None = None
