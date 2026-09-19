from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


MATERIAL_TYPES = {"source_item", "knowledge_note"}
MATERIAL_DIRECTIONS = {"support", "weaken", "neutral", "noise"}
MATERIAL_IMPORTANCE = {"high", "medium", "low"}
MATERIAL_STATUSES = {"pending", "confirmed", "ignored"}
CONFIDENCE_LEVELS = {"low", "medium", "high"}
# 枚举一律英文小写码，中文展示留给 Web 层：中文入库在 PG 下一个字占 3 字节，
# 会把 VARCHAR(16) 撑爆，前端也得靠中文串做比较和筛选。
TRACK_CYCLES = {"short", "mid", "long"}
# 证据不足独立成值，不强行归进中或弱。
TRACK_STRENGTHS = {"strong", "medium", "weak", "insufficient"}
TRACK_DIRECTIONS = {"strengthening", "stable", "weakening"}
RESEARCH_PRIORITIES = {"priority", "tracking", "deprioritized"}
INDUSTRY_PHASES = {"intro", "expansion", "mature", "contraction"}
MARKET_PHASES = {"latent", "start", "ferment", "accelerate", "climax", "divergence", "recede"}


def _validate_choice(value: str | None, allowed: set[str], field: str) -> str | None:
    if value is not None and value not in allowed:
        raise ValueError(f"{field} must be one of: {', '.join(sorted(allowed))}")
    return value


class TrackCreate(BaseModel):
    name: str
    description: str | None = None
    status: str = "candidate"
    current_view: str | None = None
    industry_phase: str | None = None
    market_phase: str | None = None
    confidence_level: str | None = None

    @field_validator("industry_phase")
    @classmethod
    def validate_industry_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, INDUSTRY_PHASES, "industry_phase")

    @field_validator("market_phase")
    @classmethod
    def validate_market_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, MARKET_PHASES, "market_phase")

    @field_validator("confidence_level")
    @classmethod
    def validate_confidence_level(cls, value: str | None) -> str | None:
        return _validate_choice(value, CONFIDENCE_LEVELS, "confidence_level")


class TrackUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    current_view: str | None = None
    industry_phase: str | None = None
    market_phase: str | None = None
    confidence_level: str | None = None

    @field_validator("industry_phase")
    @classmethod
    def validate_industry_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, INDUSTRY_PHASES, "industry_phase")

    @field_validator("market_phase")
    @classmethod
    def validate_market_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, MARKET_PHASES, "market_phase")

    @field_validator("confidence_level")
    @classmethod
    def validate_confidence_level(cls, value: str | None) -> str | None:
        return _validate_choice(value, CONFIDENCE_LEVELS, "confidence_level")


class TrackRead(TrackCreate):
    id: int
    latest_snapshot_id: int | None = None
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
        return _validate_choice(value, MATERIAL_DIRECTIONS, "direction")

    @field_validator("importance_level")
    @classmethod
    def validate_importance_level(cls, value: str | None) -> str | None:
        return _validate_choice(value, MATERIAL_IMPORTANCE, "importance_level")

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
    new_industry_phase: str | None = None
    new_market_phase: str | None = None
    reason: str | None = None
    changed_by: str = "manual"

    @field_validator("new_industry_phase")
    @classmethod
    def validate_new_industry_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, INDUSTRY_PHASES, "new_industry_phase")

    @field_validator("new_market_phase")
    @classmethod
    def validate_new_market_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, MARKET_PHASES, "new_market_phase")


class TrackStatusHistoryRead(BaseModel):
    id: int
    track_id: int
    old_status: str | None = None
    new_status: str
    old_industry_phase: str | None = None
    new_industry_phase: str | None = None
    old_market_phase: str | None = None
    new_market_phase: str | None = None
    reason: str | None = None
    changed_by: str
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackTrendSnapshotCreate(BaseModel):
    """一份赛道趋势研究报告的结论。除身份和卡片三项外全部可空：
    报告原文经 report_id 可回溯，不值得为少一个字段让整条快照落不了库。
    """

    research_date: date
    headline_cycle: str
    headline_strength: str
    researcher_code: str | None = None
    report_id: int | None = None
    core_judgment: str | None = None
    research_priority: str | None = None
    priority_rank: int | None = None
    confidence_level: str | None = None

    short_strength: str | None = None
    short_direction: str | None = None
    short_basis: str | None = None
    mid_strength: str | None = None
    mid_direction: str | None = None
    mid_basis: str | None = None
    long_strength: str | None = None
    long_direction: str | None = None
    long_basis: str | None = None

    demand_space: str | None = None
    supply_competition: str | None = None
    profit_cashflow: str | None = None
    policy_catalyst: str | None = None
    market_capital: str | None = None
    pricing_expectation_gap: str | None = None

    key_contradiction: str | None = None
    segments_json: str | None = None

    industry_phase: str | None = None
    market_phase: str | None = None
    scenarios_json: str | None = None
    next_verification: str | None = None

    risk_falsification: str | None = None
    change_vs_last: str | None = None
    data_gaps: str | None = None
    data_sources_json: str | None = None

    @field_validator("headline_cycle")
    @classmethod
    def validate_headline_cycle(cls, value: str) -> str:
        return _validate_choice(value, TRACK_CYCLES, "headline_cycle")

    @field_validator("headline_strength", "short_strength", "mid_strength", "long_strength")
    @classmethod
    def validate_strength(cls, value: str | None) -> str | None:
        return _validate_choice(value, TRACK_STRENGTHS, "strength")

    @field_validator("short_direction", "mid_direction", "long_direction")
    @classmethod
    def validate_direction(cls, value: str | None) -> str | None:
        return _validate_choice(value, TRACK_DIRECTIONS, "direction")

    @field_validator("confidence_level")
    @classmethod
    def validate_confidence_level(cls, value: str | None) -> str | None:
        return _validate_choice(value, CONFIDENCE_LEVELS, "confidence_level")

    @field_validator("research_priority")
    @classmethod
    def validate_research_priority(cls, value: str | None) -> str | None:
        return _validate_choice(value, RESEARCH_PRIORITIES, "research_priority")

    @field_validator("industry_phase")
    @classmethod
    def validate_industry_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, INDUSTRY_PHASES, "industry_phase")

    @field_validator("market_phase")
    @classmethod
    def validate_market_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, MARKET_PHASES, "market_phase")

    @field_validator("priority_rank")
    @classmethod
    def validate_priority_rank(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError("priority_rank must be a positive integer or null")
        return value


class TrackTrendSnapshotRead(TrackTrendSnapshotCreate):
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
    latest_snapshot: TrackTrendSnapshotRead | None = None
    trend_snapshots: list[TrackTrendSnapshotRead] = Field(default_factory=list)
    materials: list[TrackMaterialRead] = Field(default_factory=list)
    stocks: list[TrackDetailStockRelation] = Field(default_factory=list)
    tags: list[dict] = Field(default_factory=list)
