from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StockBase(BaseModel):
    symbol: str | None = None
    stock_code: str
    stock_name: str
    name_pinyin: str | None = None
    name_abbr: str | None = None
    market: str | None = None
    exchange: str | None = None
    status: str = "active"


class StockImportItem(BaseModel):
    symbol: str | None = None
    stock_code: str
    stock_name: str
    name_pinyin: str | None = None
    name_abbr: str | None = None
    market: str | None = None
    exchange: str | None = None


class StockUpdate(BaseModel):
    symbol: str | None = None
    stock_code: str | None = None
    stock_name: str | None = None
    name_pinyin: str | None = None
    name_abbr: str | None = None
    market: str | None = None
    exchange: str | None = None
    status: str | None = None


class StockRead(StockBase):
    id: int
    aliases: list["StockAliasRead"] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StockAliasCreate(BaseModel):
    alias: str
    alias_type: str | None = None
    source: str | None = None


class StockAliasRead(StockAliasCreate):
    id: int
    stock_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StockAliasReplace(BaseModel):
    aliases: list[StockAliasCreate] = []
