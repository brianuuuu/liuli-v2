import json
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator

from invest_assistant.modules.knowledge_base.schemas import KnowledgeNoteRead
from invest_assistant.modules.track_discovery.scoring import SCORE_MAX, SCORE_MIN, TRACK_SCORE_FIELDS


# 笔记与材料并列，经标签归属到赛道，不作为材料引用。
MATERIAL_TYPES = {"source_item"}
MATERIAL_DIRECTIONS = {"support", "weaken", "neutral", "noise"}
MATERIAL_IMPORTANCE = {"high", "medium", "low"}
MATERIAL_STATUSES = {"pending", "confirmed", "ignored"}
CONFIDENCE_LEVELS = {"low", "medium", "high"}
# 枚举一律英文小写码，中文展示留给 Web 层：中文入库在 PG 下一个字占 3 字节，
# 会把 VARCHAR(16) 撑爆，前端也得靠中文串做比较和筛选。
TRACK_CYCLES = {"short", "mid", "long"}
INDUSTRY_PHASES = {"intro", "expansion", "mature", "contraction"}
MARKET_PHASES = {"latent", "start", "ferment", "accelerate", "climax", "divergence", "recede"}


def _validate_choice(value: str | None, allowed: set[str], field: str) -> str | None:
    if value is not None and value not in allowed:
        raise ValueError(f"{field} must be one of: {', '.join(sorted(allowed))}")
    return value


TrackCycle = Literal["short", "mid", "long"]


class TrackCycleView(BaseModel):
    direction: Literal["positive", "neutral", "negative", "uncertain"]
    judgment: str = Field(min_length=1)
    confidence: Literal["high", "medium", "low"]

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TrackResearchSource(BaseModel):
    snapshot_id: int
    report_id: int | None = None
    research_date: date


class TrackCycleViewRead(TrackCycleView, TrackResearchSource):
    """当前周期判断及其真实来源；来源字段不接受研究报告传入。"""


_CYCLE_VIEWS_ADAPTER = TypeAdapter(dict[TrackCycle, TrackCycleView])


def parse_cycle_views_json(value: str | None) -> dict[str, dict[str, str]]:
    if value is None:
        return {}
    views = _CYCLE_VIEWS_ADAPTER.validate_python(json.loads(value))
    return {cycle: view.model_dump() for cycle, view in views.items()}


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
    # 最新实际评分来源的角标和综合分；最新报告可以只更新定性判断。
    # 从未评分的赛道三项都是 null，不要在这里补 0 分或 D 级。
    track_grade: str | None = None
    heat_tier: str | None = None
    overall_score: float | None = None
    headline_cycle: str | None = None
    research_date: date | None = None
    next_verification: str | None = None
    next_verification_date: date | None = None
    cycle_views: dict[TrackCycle, TrackCycleViewRead] = Field(default_factory=dict)
    score_source: TrackResearchSource | None = None
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
            raise ValueError("material_type must be source_item")
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


class TrackMaterialDetailRead(TrackMaterialRead):
    # 详情页专用：material_content 是未截断的正文，列表接口不带，避免把全文塞进信息流。
    material_content: str | None = None


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
    """一份赛道趋势研究报告的结论。

    六个评分全有或全无；定性研究必须提供实际周期判断或核心判断，不复制历史评分。
    周期省略表示本次未研究，uncertain 表示本次明确待验证，不能回退到旧方向。

    综合分、评级、热度档位是服务端派生的，不在这里接收：允许传值就会出现分数和评级对不上
    的快照，而这两者对不上时没人知道该信哪个。
    """

    research_date: date
    headline_cycle: str
    market_heat_score: float | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX, allow_inf_nan=False)
    growth_speed_score: float | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX, allow_inf_nan=False)
    concentration_score: float | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX, allow_inf_nan=False)
    cycle_resilience_score: float | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX, allow_inf_nan=False)
    current_market_size_score: float | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX, allow_inf_nan=False)
    future_market_size_score: float | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX, allow_inf_nan=False)
    researcher_code: str | None = None
    report_id: int | None = None
    core_judgment: str | None = None
    cycle_views_json: str | None = None

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
    next_verification_date: date | None = None

    risk_falsification: str | None = None
    change_vs_last: str | None = None
    data_gaps: str | None = None
    data_sources_json: str | None = None

    @field_validator(*TRACK_SCORE_FIELDS, mode="before")
    @classmethod
    def reject_boolean_scores(cls, value):
        if isinstance(value, bool):
            raise ValueError("scores must be numbers, not booleans")
        return value

    @field_validator("cycle_views_json")
    @classmethod
    def validate_cycle_views_json(cls, value: str | None) -> str | None:
        views = parse_cycle_views_json(value)
        return json.dumps(views, ensure_ascii=False) if views else None

    @model_validator(mode="after")
    def validate_research_content(self):
        provided = [getattr(self, field) is not None for field in TRACK_SCORE_FIELDS]
        if any(provided) and not all(provided):
            raise ValueError("six track scores must be supplied together or all omitted")
        if not any(provided) and not self.cycle_views_json and not (self.core_judgment or "").strip():
            raise ValueError("unscored research requires cycle_views_json or core_judgment")
        return self

    @field_validator("headline_cycle")
    @classmethod
    def validate_headline_cycle(cls, value: str) -> str:
        return _validate_choice(value, TRACK_CYCLES, "headline_cycle")

    @field_validator("industry_phase")
    @classmethod
    def validate_industry_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, INDUSTRY_PHASES, "industry_phase")

    @field_validator("market_phase")
    @classmethod
    def validate_market_phase(cls, value: str | None) -> str | None:
        return _validate_choice(value, MARKET_PHASES, "market_phase")


class TrackTrendSnapshotRead(TrackTrendSnapshotCreate):
    id: int
    track_id: int
    # 派生三项只读不写，写入端由 scoring 算好，见 TrackTrendSnapshotCreate 的说明。
    overall_score: float | None = None
    track_grade: str | None = None
    heat_tier: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackTrendSnapshotBrief(BaseModel):
    """详情页历史快照列表用的简表。

    完整快照有近二十列长文本，一次回 30 份能到几百 KB，而列表只显示日期、角标、
    六维分数和核心判断一句话。要看某一份的正文走 /trend-snapshots。
    """

    id: int
    track_id: int
    research_date: date
    researcher_code: str | None = None
    report_id: int | None = None
    headline_cycle: str
    core_judgment: str | None = None
    cycle_views_json: str | None = None
    next_verification_date: date | None = None

    market_heat_score: float | None = None
    growth_speed_score: float | None = None
    concentration_score: float | None = None
    cycle_resilience_score: float | None = None
    current_market_size_score: float | None = None
    future_market_size_score: float | None = None

    overall_score: float | None = None
    track_grade: str | None = None
    heat_tier: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrackDetailSummary(BaseModel):
    tag_count: int = 0
    material_count: int = 0
    pending_material_count: int = 0
    high_importance_material_count: int = 0
    bound_stock_count: int = 0
    note_count: int = 0
    # 资讯热度：最新 7d 窗口内带该赛道标签的资讯条数，heat_change 是相对一天前的变化。
    latest_heat_score: float | None = None
    heat_change: float | None = None
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
    cycle_views: dict[TrackCycle, TrackCycleViewRead] = Field(default_factory=dict)
    score_source: TrackResearchSource | None = None
    score_snapshot: TrackTrendSnapshotBrief | None = None
    trend_snapshots: list[TrackTrendSnapshotBrief] = Field(default_factory=list)
    materials: list[TrackMaterialRead] = Field(default_factory=list)
    stocks: list[TrackDetailStockRelation] = Field(default_factory=list)
    notes: list[KnowledgeNoteRead] = Field(default_factory=list)
    tags: list[dict] = Field(default_factory=list)
