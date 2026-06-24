from datetime import datetime

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
