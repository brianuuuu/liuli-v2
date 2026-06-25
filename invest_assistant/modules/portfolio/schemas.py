from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class PortfolioCreate(BaseModel):
    name: str
    base_currency: str = "CNY"


class PortfolioRead(PortfolioCreate):
    id: int
    user_id: int | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PortfolioGroupCreate(BaseModel):
    name: str
    group_type: str = "custom"
    target_weight: float | None = None
    max_stock_count: int | None = None
    sort_order: int = 0
    note: str | None = None
    status: str = "active"


class PortfolioGroupRead(PortfolioGroupCreate):
    id: int
    portfolio_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PortfolioPositionCreate(BaseModel):
    group_id: int | None = None
    stock_id: int
    quantity: float
    cost_price: float | None = None
    current_price: float | None = None
    previous_close: float | None = None
    market_value: float | None = None
    quote_time: datetime | None = None
    price_source: str | None = None
    target_weight: float | None = None
    note: str | None = None
    status: str = "active"


class PortfolioPositionRead(PortfolioPositionCreate):
    id: int
    portfolio_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PortfolioReviewCreate(BaseModel):
    title: str
    content: str
    risk_summary: str | None = None


class PortfolioReviewRead(PortfolioReviewCreate):
    id: int
    portfolio_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PortfolioCashUpdate(BaseModel):
    amount: float
    currency: str = "CNY"
    note: str | None = None


class PortfolioCashRead(PortfolioCashUpdate):
    id: int | None = None
    portfolio_id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class PortfolioCashFlowCreate(BaseModel):
    flow_type: str
    amount: float
    currency: str = "CNY"
    flow_date: date | None = None
    note: str | None = None


class PortfolioCashFlowRead(PortfolioCashFlowCreate):
    id: int
    portfolio_id: int
    flow_date: date
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PortfolioValueSnapshotRead(BaseModel):
    portfolio_id: int | None = None
    snapshot_date: date
    total_value: float
    position_market_value: float
    cash_amount: float
    day_pnl: float | None = None
    day_pct: float | None = None
    position_count: int
    source: str | None = None
