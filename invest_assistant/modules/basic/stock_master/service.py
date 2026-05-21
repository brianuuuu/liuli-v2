from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import Stock, StockAlias
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem, StockUpdate
from invest_assistant.modules.market_radar.models import Tag


@dataclass
class StockSyncResult:
    total: int
    inserted: int
    updated: int
    disabled: int
    sse: int
    szse: int
    bj: int


def parse_a_stock_code(code: str) -> tuple[str, str, str, str]:
    normalized = str(code or "").strip()
    if len(normalized) < 6 and normalized.isdigit():
        normalized = normalized.zfill(6)
    if normalized.startswith("6"):
        exchange = "SSE"
        symbol = f"{normalized}.SH"
        market = "STAR" if normalized.startswith("688") else "MAIN"
    elif normalized.startswith(("0", "3")):
        exchange = "SZSE"
        symbol = f"{normalized}.SZ"
        market = "GEM" if normalized.startswith(("300", "301")) else "MAIN"
    elif normalized.startswith(("4", "8")):
        exchange = "BJ"
        symbol = f"{normalized}.BJ"
        market = "BJ"
    else:
        exchange = "OTHER"
        symbol = normalized
        market = "OTHER"
    return normalized, symbol, exchange, market


def stock_name_pinyin(name: str) -> tuple[str, str]:
    if not name:
        return "", ""
    try:
        from pypinyin import lazy_pinyin
    except Exception:
        return "", ""
    try:
        parts = [part for part in lazy_pinyin(name) if part]
    except Exception:
        return "", ""
    return "".join(parts).lower(), "".join(part[0] for part in parts if part).lower()


def build_a_stock_item(code: str, name: str) -> StockImportItem | None:
    stock_code = str(code or "").strip()
    stock_name = str(name or "").strip()
    if not stock_code or not stock_name:
        return None
    stock_code, symbol, exchange, market = parse_a_stock_code(stock_code)
    name_pinyin, name_abbr = stock_name_pinyin(stock_name)
    return StockImportItem(
        symbol=symbol,
        stock_code=stock_code,
        stock_name=stock_name,
        name_pinyin=name_pinyin,
        name_abbr=name_abbr,
        market=market,
        exchange=exchange,
    )


def normalize_stock_item(item: StockImportItem) -> StockImportItem:
    derived = build_a_stock_item(item.stock_code, item.stock_name)
    if derived is None:
        return item
    return StockImportItem(
        symbol=item.symbol or derived.symbol,
        stock_code=derived.stock_code,
        stock_name=item.stock_name,
        name_pinyin=item.name_pinyin if item.name_pinyin is not None else derived.name_pinyin,
        name_abbr=item.name_abbr if item.name_abbr is not None else derived.name_abbr,
        market=item.market if item.market is not None else derived.market,
        exchange=item.exchange if item.exchange is not None else derived.exchange,
    )


def _apply_stock_item(stock: Stock, item: StockImportItem, status: str = "active") -> None:
    stock.symbol = item.symbol
    stock.stock_code = item.stock_code
    stock.stock_name = item.stock_name
    stock.name_pinyin = item.name_pinyin
    stock.name_abbr = item.name_abbr
    stock.market = item.market
    stock.exchange = item.exchange
    stock.status = status


def import_stocks(db: Session, items: list[StockImportItem]) -> list[Stock]:
    result: list[Stock] = []
    for raw_item in items:
        item = normalize_stock_item(raw_item)
        stock = db.scalar(
            select(Stock).where(Stock.stock_code == item.stock_code, Stock.exchange == item.exchange)
        )
        if stock is None:
            stock = Stock(stock_code=item.stock_code, stock_name=item.stock_name)
            db.add(stock)
        else:
            stock.stock_name = item.stock_name
        _apply_stock_item(stock, item, stock.status or "active")
        result.append(stock)
    db.commit()
    for stock in result:
        db.refresh(stock)
        sync_stock_tag(db, stock)
    return result


def sync_a_stock_basics(db: Session, items: list[StockImportItem]) -> StockSyncResult:
    if not items:
        raise ValueError("stock list is empty")
    normalized_by_key = {}
    for item in items:
        normalized = normalize_stock_item(item)
        normalized_by_key[(normalized.stock_code, normalized.exchange)] = normalized
    normalized_items = list(normalized_by_key.values())
    seen_keys = set(normalized_by_key.keys())
    inserted = 0
    updated = 0
    result_stocks: list[Stock] = []

    for item in normalized_items:
        stock = db.scalar(select(Stock).where(Stock.stock_code == item.stock_code, Stock.exchange == item.exchange))
        if stock is None:
            stock = Stock(stock_code=item.stock_code, stock_name=item.stock_name)
            db.add(stock)
            inserted += 1
        else:
            updated += 1
        _apply_stock_item(stock, item, "active")
        result_stocks.append(stock)

    disabled = 0
    existing_a_stocks = list(db.scalars(select(Stock).where(Stock.exchange.in_(["SSE", "SZSE", "BJ"]))))
    for stock in existing_a_stocks:
        if (stock.stock_code, stock.exchange) in seen_keys or stock.status == "disabled":
            continue
        stock.status = "disabled"
        disabled += 1
        result_stocks.append(stock)

    db.flush()
    for stock in result_stocks:
        sync_stock_tag(db, stock, commit=False)
    db.commit()
    return StockSyncResult(
        total=len(normalized_items),
        inserted=inserted,
        updated=updated,
        disabled=disabled,
        sse=sum(1 for item in normalized_items if item.exchange == "SSE"),
        szse=sum(1 for item in normalized_items if item.exchange == "SZSE"),
        bj=sum(1 for item in normalized_items if item.exchange == "BJ"),
    )


def list_stocks(db: Session, limit: int = 100, offset: int = 0) -> list[Stock]:
    return list(db.scalars(select(Stock).order_by(Stock.id.desc()).limit(limit).offset(offset)))


def get_stock(db: Session, stock_id: int) -> Stock | None:
    return db.get(Stock, stock_id)


def search_stocks(db: Session, keyword: str) -> list[Stock]:
    pattern = f"%{keyword}%"
    return list(
        db.scalars(
            select(Stock)
            .where(
                or_(
                    Stock.symbol.like(pattern),
                    Stock.stock_code.like(pattern),
                    Stock.stock_name.like(pattern),
                    Stock.name_pinyin.like(pattern),
                    Stock.name_abbr.like(pattern),
                )
            )
            .order_by(Stock.stock_code.asc())
        )
    )


def update_stock(db: Session, stock: Stock, payload: StockUpdate) -> Stock:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(stock, key, value)
    db.commit()
    db.refresh(stock)
    sync_stock_tag(db, stock)
    return stock


def list_aliases(db: Session, stock_id: int) -> list[StockAlias]:
    return list(db.scalars(select(StockAlias).where(StockAlias.stock_id == stock_id).order_by(StockAlias.id.desc())))


def create_alias(db: Session, stock_id: int, alias: str, alias_type: str | None, source: str | None) -> StockAlias:
    item = StockAlias(stock_id=stock_id, alias=alias, alias_type=alias_type, source=source)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def sync_stock_tag(db: Session, stock: Stock, commit: bool = True) -> Tag:
    tag = db.scalar(select(Tag).where(Tag.type == "stock", Tag.stock_id == stock.id))
    if tag is None:
        tag = db.scalar(select(Tag).where(Tag.type == "stock", Tag.name == stock.stock_name))
    if tag is None:
        tag = Tag(name=stock.stock_name, type="stock", stock_id=stock.id, status=stock.status)
        db.add(tag)
    else:
        tag.name = stock.stock_name
        tag.stock_id = stock.id
        tag.status = stock.status
    if commit:
        db.commit()
        db.refresh(tag)
    return tag
