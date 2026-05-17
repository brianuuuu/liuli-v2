from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.stock_master.models import Stock, StockAlias
from invest_assistant.modules.basic.stock_master.schemas import StockImportItem, StockUpdate
from invest_assistant.modules.market_radar.models import Tag


def import_stocks(db: Session, items: list[StockImportItem]) -> list[Stock]:
    result: list[Stock] = []
    for item in items:
        stock = db.scalar(
            select(Stock).where(Stock.stock_code == item.stock_code, Stock.exchange == item.exchange)
        )
        if stock is None:
            stock = Stock(
                stock_code=item.stock_code,
                stock_name=item.stock_name,
                market=item.market,
                exchange=item.exchange,
            )
            db.add(stock)
        else:
            stock.stock_name = item.stock_name
            stock.market = item.market
            stock.exchange = item.exchange
        result.append(stock)
    db.commit()
    for stock in result:
        db.refresh(stock)
        sync_stock_tag(db, stock)
    return result


def list_stocks(db: Session, limit: int = 100, offset: int = 0) -> list[Stock]:
    return list(db.scalars(select(Stock).order_by(Stock.id.desc()).limit(limit).offset(offset)))


def get_stock(db: Session, stock_id: int) -> Stock | None:
    return db.get(Stock, stock_id)


def search_stocks(db: Session, keyword: str) -> list[Stock]:
    pattern = f"%{keyword}%"
    return list(
        db.scalars(
            select(Stock)
            .where(or_(Stock.stock_code.like(pattern), Stock.stock_name.like(pattern)))
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


def sync_stock_tag(db: Session, stock: Stock) -> Tag:
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
    db.commit()
    db.refresh(tag)
    return tag
