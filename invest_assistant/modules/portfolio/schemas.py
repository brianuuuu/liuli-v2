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


class PortfolioPositionCreate(BaseModel):
    stock_id: int
    quantity: float
    cost_price: float


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
