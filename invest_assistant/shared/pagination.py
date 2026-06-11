from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

T = TypeVar("T")

DEFAULT_LIMIT = 50
MAX_LIMIT = 100


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
    has_more: bool
    model_config = ConfigDict(arbitrary_types_allowed=True)


def normalize_limit(limit: int | None, default: int = DEFAULT_LIMIT, maximum: int = MAX_LIMIT) -> int:
    value = default if limit is None else int(limit)
    return max(1, min(value, maximum))


def normalize_offset(offset: int | None) -> int:
    return max(0, int(offset or 0))


def make_page(items: list[T], total: int, limit: int, offset: int) -> Page[T]:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    return Page(
        items=items,
        total=int(total or 0),
        limit=safe_limit,
        offset=safe_offset,
        has_more=safe_offset + len(items) < int(total or 0),
    )


def page_from_statement(db: Session, stmt, *, limit: int | None = None, offset: int | None = None) -> Page:
    safe_limit = normalize_limit(limit)
    safe_offset = normalize_offset(offset)
    count_stmt = select(func.count()).select_from(stmt.order_by(None).limit(None).offset(None).subquery())
    total = int(db.scalar(count_stmt) or 0)
    items = list(db.scalars(stmt.limit(safe_limit).offset(safe_offset)))
    return make_page(items, total, safe_limit, safe_offset)
