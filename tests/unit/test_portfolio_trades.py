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
    closed = position_of(db, portfolio)
    assert closed.quantity == 0
    assert closed.status == "closed"
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


def seed_advice_item(db: Session, portfolio: Portfolio, stock: Stock, action: str, feedback_id: int = 1) -> PortfolioAdjustAdviceItem:
    advice = PortfolioAdjustAdvice(
        portfolio_id=portfolio.id,
        feedback_id=feedback_id,
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


def test_trade_route_returns_json_when_cash_synced():
    """走 HTTP 路由：同步现金时响应序列化失败会在 commit 之后返回 500，手机端误以为失败而重复记账。"""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy.pool import StaticPool

    from invest_assistant.bootstrap.database import get_db
    from invest_assistant.modules.basic.auth.dependencies import get_current_user
    from invest_assistant.modules.portfolio.router import router

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()
    portfolio, stock = seed(db)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: None

    response = TestClient(app).post(
        f"/api/portfolios/{portfolio.id}/trades",
        json={"stock_id": stock.id, "side": "sell", "quantity": 200, "price": 15.0, "sync_cash": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["cash_synced"] is True
    assert body["cash_flow"]["flow_type"] == "trade"
    assert body["cash_flow"]["amount"] == pytest.approx(3_000)


def test_close_keeps_position_settings_and_rebuy_restores_them():
    db = make_session()
    portfolio, stock = seed(db)

    trade(db, portfolio, stock, side="close", quantity=None)
    assert service.list_positions(db, portfolio.id) == []
    assert service.get_dashboard(db, portfolio.id)["positions"] == []
    with pytest.raises(ValueError, match="position not found"):
        trade(db, portfolio, stock, side="sell", quantity=100)

    trade(db, portfolio, stock, quantity=300)
    position = position_of(db, portfolio)
    assert (position.quantity, position.status) == (300, "active")
    assert (position.target_weight, position.note) == (0.2, "核心持仓")
    assert [item.id for item in service.list_positions(db, portfolio.id)] == [position.id]


def test_same_client_request_id_records_once():
    db = make_session()
    portfolio, stock = seed(db)

    first = trade(db, portfolio, stock, side="sell", quantity=300, price=15.0, client_request_id="req-1")
    again = trade(db, portfolio, stock, side="sell", quantity=300, price=15.0, client_request_id="req-1")

    assert first["duplicate"] is False
    assert again["duplicate"] is True
    assert again["change"]["id"] == first["change"]["id"]
    assert position_of(db, portfolio).quantity == 700
    assert cash_of(db, portfolio) == pytest.approx(100_000 + 4_500)
    assert len(list(db.scalars(select(PortfolioCashFlow)))) == 1

    trade(db, portfolio, stock, side="sell", quantity=300, price=15.0, client_request_id="req-2")
    assert position_of(db, portfolio).quantity == 400


def test_advice_item_can_be_linked_only_once():
    from invest_assistant.modules.portfolio import adjust_advice

    db = make_session()
    portfolio, stock = seed(db)
    item = seed_advice_item(db, portfolio, stock, "reduce")
    assert [row["id"] for row in adjust_advice.list_advice_candidates(db, stock.id, date.today(), portfolio.id)] == [item.id]

    trade(db, portfolio, stock, side="sell", quantity=200, reason_type="ai_advice", advice_item_id=item.id)
    with pytest.raises(ValueError, match="already linked"):
        trade(db, portfolio, stock, side="sell", quantity=200, reason_type="ai_advice", advice_item_id=item.id)

    assert position_of(db, portfolio).quantity == 800
    # 已关联的照样列出，带上关联的那笔调仓，供前端置灰标注
    [linked] = adjust_advice.list_advice_candidates(db, stock.id, date.today(), portfolio.id)
    assert linked["id"] == item.id
    assert linked["linked_change"]["quantity_delta"] == -200
    assert linked["linked_change"]["change_date"] == date.today()


def test_advice_candidates_list_unlinked_before_linked():
    from invest_assistant.modules.portfolio import adjust_advice

    db = make_session()
    portfolio, stock = seed(db)
    older = seed_advice_item(db, portfolio, stock, "reduce", feedback_id=1)
    newer = seed_advice_item(db, portfolio, stock, "reduce", feedback_id=2)
    trade(db, portfolio, stock, side="sell", quantity=100, reason_type="ai_advice", advice_item_id=newer.id)

    rows = adjust_advice.list_advice_candidates(db, stock.id, date.today(), portfolio.id)
    assert [(row["id"], row["linked_change"] is not None) for row in rows] == [(older.id, False), (newer.id, True)]


def test_snapshot_failure_after_commit_still_returns_result(monkeypatch):
    db = make_session()
    portfolio, stock = seed(db)

    def broken(*args, **kwargs):
        raise RuntimeError("snapshot failed")

    monkeypatch.setattr(service, "upsert_value_snapshot", broken)
    result = trade(db, portfolio, stock, side="sell", quantity=300, price=15.0)

    assert result["cash_synced"] is True
    assert position_of(db, portfolio).quantity == 700


def update_change(db: Session, portfolio: Portfolio, change_id: int, **overrides) -> dict:
    from invest_assistant.modules.portfolio.schemas import PortfolioPositionChangeUpdate

    payload = {"change_date": date.today()} | overrides
    return service.update_position_change(db, portfolio.id, change_id, PortfolioPositionChangeUpdate(**payload))


def test_update_change_fixes_labels_without_touching_position_or_cash():
    db = make_session()
    portfolio, stock = seed(db)
    change = trade(db, portfolio, stock, side="sell", quantity=300, price=15.0)["change"]
    cash_before = cash_of(db, portfolio)

    updated = update_change(
        db, portfolio, change["id"], change_date=date.today() - timedelta(days=1), price=14.5, reason_type="personal", note="  补标  "
    )

    assert (updated["reason_type"], updated["note"], updated["price"], updated["price_source"]) == ("personal", "补标", 14.5, "manual")
    assert updated["change_date"] == date.today() - timedelta(days=1)
    assert updated["quantity_delta"] == -300
    assert position_of(db, portfolio).quantity == 700
    assert cash_of(db, portfolio) == pytest.approx(cash_before)


def test_update_change_validates_input():
    db = make_session()
    portfolio, stock = seed(db)
    change = trade(db, portfolio, stock, side="sell", quantity=300, price=15.0)["change"]

    with pytest.raises(ValueError, match="future"):
        update_change(db, portfolio, change["id"], change_date=date.today() + timedelta(days=1))
    with pytest.raises(ValueError, match="reason_type"):
        update_change(db, portfolio, change["id"], reason_type="guess")
    with pytest.raises(ValueError, match="positive"):
        update_change(db, portfolio, change["id"], price=0)
    other = Portfolio(name="实盘B", base_currency="CNY")
    db.add(other)
    db.commit()
    assert update_change(db, other, change["id"]) is None


def test_update_change_clearing_price_reestimates_from_position_quote():
    db = make_session()
    portfolio, stock = seed(db)
    change = trade(db, portfolio, stock, side="sell", quantity=300, price=15.0)["change"]

    updated = update_change(db, portfolio, change["id"], price=None, reason_type="personal")
    assert (updated["price"], updated["price_source"]) == (10.0, "estimated")

    updated = update_change(db, portfolio, change["id"], reason_type="corporate_action")
    assert (updated["price"], updated["price_source"]) == (None, None)


def test_update_change_relinks_advice_and_refreshes_execution():
    db = make_session()
    portfolio, stock = seed(db)
    first = seed_advice_item(db, portfolio, stock, "reduce", feedback_id=1)
    second = seed_advice_item(db, portfolio, stock, "reduce", feedback_id=2)
    add_item = seed_advice_item(db, portfolio, stock, "add", feedback_id=3)
    linked = trade(db, portfolio, stock, side="sell", quantity=200, reason_type="ai_advice", advice_item_id=first.id)["change"]
    other = trade(db, portfolio, stock, side="sell", quantity=100, reason_type="personal")["change"]
    for item in (first, second):
        item.execution_status = "not_executed"
    db.commit()

    with pytest.raises(ValueError, match="direction"):
        update_change(db, portfolio, other["id"], advice_item_id=add_item.id)
    with pytest.raises(ValueError, match="already linked"):
        update_change(db, portfolio, other["id"], advice_item_id=first.id)

    # 关联建议时来源强制为 AI 建议；保存同一条关联不算重复关联
    assert update_change(db, portfolio, linked["id"], advice_item_id=first.id)["advice_item_id"] == first.id
    updated = update_change(db, portfolio, other["id"], reason_type="personal", advice_item_id=second.id)
    assert (updated["reason_type"], updated["advice_item_id"]) == ("ai_advice", second.id)
    db.refresh(second)
    assert (second.execution_status, second.executed_quantity) == ("partial", 100)

    # 取消关联但仍在适用交易日：first 按日期推断匹配这笔；改到前一天后不再匹配
    update_change(db, portfolio, linked["id"], reason_type="personal")
    db.refresh(first)
    assert (first.execution_status, first.executed_quantity) == ("partial", 200)
    update_change(db, portfolio, linked["id"], change_date=date.today() - timedelta(days=1), reason_type="personal")
    db.refresh(first)
    assert (first.execution_status, first.executed_quantity) == ("not_executed", 0)
