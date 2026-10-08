from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.portfolio import service
from invest_assistant.modules.portfolio.models import (
    Portfolio,
    PortfolioAdjustAdvice,
    PortfolioAdjustAdviceItem,
    PortfolioCashBalance,
    PortfolioCashFlow,
    PortfolioPosition,
)
from invest_assistant.modules.portfolio.schemas import (
    PortfolioCashFlowCreate,
    PortfolioTradeCreate,
)


def make_session() -> Session:
    """内存库，不碰 var/db 下的任何文件。"""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.alert_center.models  # noqa: F401
    import invest_assistant.modules.portfolio.models  # noqa: F401
    import invest_assistant.modules.stock_analysis.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def seed(db: Session, *, quantity: float | None = 1000, cash: float = 100_000) -> tuple[Portfolio, Stock]:
    portfolio = Portfolio(name="实盘A", base_currency="CNY")
    stock = Stock(stock_code="300750", stock_name="宁德时代", exchange="SZSE", symbol="300750.SZ", status="active")
    db.add_all([portfolio, stock])
    db.flush()
    db.add(PortfolioCashBalance(portfolio_id=portfolio.id, amount=cash, currency="CNY"))
    if quantity is not None:
        db.add(
            PortfolioPosition(
                portfolio_id=portfolio.id,
                stock_id=stock.id,
                quantity=quantity,
                current_price=10.0,
                target_weight=0.2,
                note="核心持仓",
                status="active",
            )
        )
    db.commit()
    return portfolio, stock


def trade(db: Session, portfolio: Portfolio, stock: Stock, **overrides) -> dict:
    payload = {"stock_id": stock.id, "side": "buy", "quantity": 500, "price": 12.0} | overrides
    return service.record_trade(db, portfolio.id, PortfolioTradeCreate(**payload))


def position_of(db: Session, portfolio: Portfolio) -> PortfolioPosition | None:
    return db.scalar(select(PortfolioPosition).where(PortfolioPosition.portfolio_id == portfolio.id))


def cash_of(db: Session, portfolio: Portfolio) -> float:
    return db.scalar(select(PortfolioCashBalance.amount).where(PortfolioCashBalance.portfolio_id == portfolio.id))


def test_buy_adds_quantity_and_keeps_other_position_fields():
    db = make_session()
    portfolio, stock = seed(db)

    result = trade(db, portfolio, stock, reason_type="personal", note="加仓")

    position = position_of(db, portfolio)
    assert position.quantity == 1500
    assert position.target_weight == 0.2
    assert position.note == "核心持仓"
    assert position.current_price == 10.0
    assert result["position_quantity_before"] == 1000
    assert result["position_quantity_after"] == 1500
    change = result["change"]
    assert change["quantity_delta"] == 500
    assert change["price"] == 12.0
    assert change["price_source"] == "manual"
    assert change["reason_type"] == "personal"


def test_buy_creates_position_when_not_held():
    db = make_session()
    portfolio, stock = seed(db, quantity=None)

    trade(db, portfolio, stock, quantity=200)

    position = position_of(db, portfolio)
    assert position.quantity == 200
    assert position.status == "active"


def test_sell_and_close():
    db = make_session()
    portfolio, stock = seed(db)

    trade(db, portfolio, stock, side="sell", quantity=300)
    assert position_of(db, portfolio).quantity == 700

    result = trade(db, portfolio, stock, side="close", quantity=None, reason_type="fund_allocation")
    assert position_of(db, portfolio) is None
    assert result["position_quantity_after"] == 0
    assert result["change"]["quantity_after"] == 0
    assert result["change"]["reason_type"] == "fund_allocation"


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"side": "sell", "quantity": 1001}, "exceeds"),
        ({"quantity": 0}, "positive"),
        ({"reason_type": "unknown"}, "reason_type"),
        ({"trade_date": date.today() + timedelta(days=2)}, "future"),
    ],
)
def test_trade_rejects_invalid_input(overrides, message):
    db = make_session()
    portfolio, stock = seed(db)

    with pytest.raises(ValueError, match=message):
        trade(db, portfolio, stock, **overrides)
    assert position_of(db, portfolio).quantity == 1000


def test_sell_without_position_is_rejected():
    db = make_session()
    portfolio, stock = seed(db, quantity=None)

    with pytest.raises(ValueError, match="position not found"):
        trade(db, portfolio, stock, side="sell", quantity=100)


def test_sync_cash_writes_signed_trade_flow():
    db = make_session()
    portfolio, stock = seed(db)

    buy = trade(db, portfolio, stock, quantity=500, price=12.0)
    assert buy["cash_synced"] is True
    assert cash_of(db, portfolio) == pytest.approx(100_000 - 6_000)

    trade(db, portfolio, stock, side="sell", quantity=200, price=15.0)
    assert cash_of(db, portfolio) == pytest.approx(94_000 + 3_000)

    flows = list(db.scalars(select(PortfolioCashFlow).order_by(PortfolioCashFlow.id)))
    assert [flow.flow_type for flow in flows] == ["trade", "trade"]
    assert [flow.amount for flow in flows] == [pytest.approx(-6_000), pytest.approx(3_000)]
    assert flows[0].note == "调仓 宁德时代 +500 股"
    # 调仓流水不是外部资金，不进日盈亏和复盘收益的扣减
    assert all(service._external_flow_amount(flow) == 0 for flow in flows)


def test_corporate_action_never_syncs_cash_or_estimates_price():
    db = make_session()
    portfolio, stock = seed(db)

    result = trade(db, portfolio, stock, quantity=300, price=None, reason_type="corporate_action")

    assert position_of(db, portfolio).quantity == 1300
    assert result["change"]["price"] is None
    assert result["cash_synced"] is False
    assert cash_of(db, portfolio) == 100_000


def test_sync_cash_off_leaves_cash_untouched():
    db = make_session()
    portfolio, stock = seed(db)

    result = trade(db, portfolio, stock, sync_cash=False)

    assert result["cash_synced"] is False
    assert cash_of(db, portfolio) == 100_000
    assert db.scalar(select(PortfolioCashFlow)) is None


def test_estimated_price_from_position_quote_drives_cash_sync():
    db = make_session()
    portfolio, stock = seed(db)

    result = trade(db, portfolio, stock, price=None, quantity=100)

    assert result["change"]["price_source"] == "estimated"
    assert result["change"]["price"] == 10.0
    assert cash_of(db, portfolio) == pytest.approx(99_000)


def test_manual_cash_flow_rejects_trade_type():
    db = make_session()
    portfolio, _stock = seed(db)

    with pytest.raises(ValueError, match="unsupported"):
        service.create_cash_flow(db, portfolio.id, PortfolioCashFlowCreate(flow_type="trade", amount=100))


def seed_advice_item(db: Session, portfolio: Portfolio, stock: Stock, action: str) -> PortfolioAdjustAdviceItem:
    advice = PortfolioAdjustAdvice(
        portfolio_id=portfolio.id,
        feedback_id=1,
        data_as_of_date=date.today(),
        target_trade_date=date.today(),
        status="active",
    )
    db.add(advice)
    db.flush()
    item = PortfolioAdjustAdviceItem(
        advice_id=advice.id,
        stock_id=stock.id,
        action=action,
        quantity=500,
        risk_level="none",
        detail_json="{}",
    )
    db.add(item)
    db.commit()
    return item


def test_advice_link_must_match_trade_side():
    db = make_session()
    portfolio, stock = seed(db)
    add_item = seed_advice_item(db, portfolio, stock, "add")

    with pytest.raises(ValueError, match="direction"):
        trade(db, portfolio, stock, side="sell", quantity=100, reason_type="ai_advice", advice_item_id=add_item.id)

    result = trade(db, portfolio, stock, reason_type="ai_advice", advice_item_id=add_item.id)
    assert result["change"]["advice_item_id"] == add_item.id
    assert result["change"]["advice_action"] == "add"
