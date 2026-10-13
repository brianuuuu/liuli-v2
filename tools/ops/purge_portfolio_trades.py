"""撤销某一天记的调仓，把持仓、现金恢复到这些调仓之前。

一笔调仓（service.record_trade）会写这些表：
  portfolio_position          持仓股数（清仓时整行删除）
  portfolio_position_change   调仓记录
  portfolio_cash_flow         同步现金时的 trade 流水
  portfolio_cash_balance      同步现金时的现金余额
  portfolio_adjust_advice_item 关联微操建议时的执行情况
  portfolio_value_snapshot    同步现金后当天的组合市值快照

用法（默认只预览，不写库）：
  python tools/ops/purge_portfolio_trades.py                       # 预览今天的调仓
  python tools/ops/purge_portfolio_trades.py --portfolio-id 3      # 只看某个组合
  python tools/ops/purge_portfolio_trades.py --apply               # 备份后执行

执行前会把所有要动的行导出到 var/db/recovery/ 下的 JSON；SQLite 库另外整库复制一份。
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date, datetime
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import inspect, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from invest_assistant.bootstrap.database import SessionLocal, engine  # noqa: E402
from invest_assistant.modules.basic.stock_master.models import Stock  # noqa: E402
from invest_assistant.modules.portfolio import adjust_advice, service  # noqa: E402
from invest_assistant.modules.portfolio.models import (  # noqa: E402
    Portfolio,
    PortfolioAdjustAdvice,
    PortfolioAdjustAdviceItem,
    PortfolioCashBalance,
    PortfolioCashFlow,
    PortfolioPosition,
    PortfolioPositionChange,
    PortfolioValueSnapshot,
)

RECOVERY_DIR = ROOT / "var" / "db" / "recovery"


def _row(obj) -> dict:
    return {attr.key: getattr(obj, attr.key) for attr in inspect(obj).mapper.column_attrs}


def _match_cash_flow(change: PortfolioPositionChange, stock_name: str, flows: list[PortfolioCashFlow]) -> PortfolioCashFlow | None:
    """trade 流水和调仓之间没有外键，按 sync_change_cash 的写法反查：同组合、同日期、同金额、备注带股票名。"""
    if change.price is None:
        return None
    amount = -float(change.quantity_delta) * float(change.price)
    for flow in flows:
        if (
            flow.portfolio_id == change.portfolio_id
            and flow.flow_date == change.change_date
            and abs(float(flow.amount) - amount) < 0.005
            and (flow.note or "").startswith(f"调仓 {stock_name} ")
        ):
            return flow
    return None


def plan(db: Session, day: date, portfolio_id: int | None) -> dict:
    stmt = select(PortfolioPositionChange).where(PortfolioPositionChange.change_date == day)
    if portfolio_id is not None:
        stmt = stmt.where(PortfolioPositionChange.portfolio_id == portfolio_id)
    changes = list(db.scalars(stmt.order_by(PortfolioPositionChange.id)))
    trade_flows = list(
        db.scalars(
            select(PortfolioCashFlow).where(
                PortfolioCashFlow.flow_type == service.TRADE_CASH_FLOW_TYPE,
                PortfolioCashFlow.flow_date == day,
            )
        )
    )

    groups: dict[tuple[int, int], list[PortfolioPositionChange]] = defaultdict(list)
    for change in changes:
        groups[(change.portfolio_id, change.stock_id)].append(change)

    positions = []
    flows: list[tuple[PortfolioPositionChange, PortfolioCashFlow]] = []
    errors = []
    for (pid, sid), items in groups.items():
        stock = db.get(Stock, sid)
        name = stock.stock_name if stock is not None else str(sid)
        # 同一只股票当天的调仓必须首尾相接，否则说明中间还有别的改动，不能简单回滚
        for prev, cur in zip(items, items[1:]):
            if abs(float(prev.quantity_after) - float(cur.quantity_before)) > 1e-9:
                errors.append(f"组合{pid} {name}：调仓 #{prev.id} 之后是 {prev.quantity_after} 股，#{cur.id} 之前却是 {cur.quantity_before} 股")
        position = db.scalar(
            select(PortfolioPosition).where(PortfolioPosition.portfolio_id == pid, PortfolioPosition.stock_id == sid)
        )
        current = float(position.quantity) if position is not None else 0.0
        if abs(current - float(items[-1].quantity_after)) > 1e-9:
            errors.append(f"组合{pid} {name}：当前持仓 {current} 股，和最后一笔调仓后的 {items[-1].quantity_after} 股对不上")
        for change in items:
            flow = _match_cash_flow(change, name, [f for f in trade_flows if f not in [m for _, m in flows]])
            if flow is not None:
                flows.append((change, flow))
        positions.append(
            {
                "portfolio_id": pid,
                "stock_id": sid,
                "stock_name": name,
                "position": position,
                "current": current,
                "target": float(items[0].quantity_before),
                "last_price": next((float(c.price) for c in reversed(items) if c.price), None),
            }
        )

    stock_ids = {sid for _, sid in groups}
    advice_items = list(
        db.scalars(
            select(PortfolioAdjustAdviceItem)
            .join(PortfolioAdjustAdvice, PortfolioAdjustAdvice.id == PortfolioAdjustAdviceItem.advice_id)
            .where(
                (PortfolioAdjustAdviceItem.id.in_({c.advice_item_id for c in changes if c.advice_item_id}))
                | (PortfolioAdjustAdviceItem.stock_id.in_(stock_ids) & (PortfolioAdjustAdvice.target_trade_date == day))
            )
        )
    ) if changes else []
    return {"changes": changes, "positions": positions, "flows": flows, "advice_items": advice_items, "errors": errors}


def print_plan(db: Session, day: date, result: dict) -> None:
    print(f"== {day} 的调仓记录：{len(result['changes'])} 笔 ==")
    for c in result["changes"]:
        portfolio = db.get(Portfolio, c.portfolio_id)
        stock = db.get(Stock, c.stock_id)
        print(
            f"  #{c.id} {portfolio.name if portfolio else c.portfolio_id} · {stock.stock_name if stock else c.stock_id}"
            f"  {c.quantity_before:g} → {c.quantity_after:g}（{c.quantity_delta:+g}）"
            f"  价格={c.price} 理由={c.reason_type or '-'} 建议={c.advice_item_id or '-'}"
        )
    print("== 持仓回滚 ==")
    for p in result["positions"]:
        action = "重建持仓" if p["position"] is None and p["target"] > 0 else "删除持仓" if p["target"] == 0 else "改股数"
        print(f"  组合{p['portfolio_id']} {p['stock_name']}：{p['current']:g} → {p['target']:g} 股（{action}）")
        if p["position"] is None and p["target"] > 0:
            print("    ⚠ 清仓时持仓行已被删除，分组、目标仓位、备注无法恢复，需要回 App 重新设置")
    print("== 现金回滚 ==")
    by_portfolio: dict[int, float] = defaultdict(float)
    for change, flow in result["flows"]:
        by_portfolio[flow.portfolio_id] -= float(flow.amount)
        print(f"  删除流水 #{flow.id} {flow.note} {float(flow.amount):+,.2f}（调仓 #{change.id}）")
    for pid, delta in by_portfolio.items():
        balance = db.scalar(select(PortfolioCashBalance).where(PortfolioCashBalance.portfolio_id == pid))
        before = float(balance.amount) if balance else 0.0
        print(f"  组合{pid} 现金：{before:,.2f} → {before + delta:,.2f}（{delta:+,.2f}）")
    unmatched = [c.id for c in result["changes"] if c.price is not None and c.reason_type != "corporate_action" and c.id not in {ch.id for ch, _ in result["flows"]}]
    if unmatched:
        print(f"  提示：调仓 {unmatched} 没找到对应现金流水（可能当时没开同步现金），现金不动")
    if result["advice_items"]:
        print(f"== 重算执行情况的微操建议条目：{[item.id for item in result['advice_items']]} ==")
    for error in result["errors"]:
        print(f"  ✗ {error}")


def backup(db: Session, day: date, result: dict) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    recovery_dir = RECOVERY_DIR
    if engine.url.get_backend_name() == "sqlite" and engine.url.database:
        db_path = Path(engine.url.database)
        if not db_path.is_absolute():
            db_path = ROOT / db_path
        recovery_dir = db_path.parent / "recovery"
        recovery_dir.mkdir(parents=True, exist_ok=True)
        copied = recovery_dir / f"{db_path.name}.before-purge-trades-{stamp}.bak"
        shutil.copy2(db_path, copied)
        print(f"已整库备份：{copied}")
    recovery_dir.mkdir(parents=True, exist_ok=True)
    portfolio_ids = {p["portfolio_id"] for p in result["positions"]}
    payload = {
        "date": day,
        "database": engine.url.render_as_string(hide_password=True),
        "portfolio_position_change": [_row(c) for c in result["changes"]],
        "portfolio_position": [_row(p["position"]) for p in result["positions"] if p["position"] is not None],
        "portfolio_cash_flow": [_row(f) for _, f in result["flows"]],
        "portfolio_cash_balance": [
            _row(b) for b in db.scalars(select(PortfolioCashBalance).where(PortfolioCashBalance.portfolio_id.in_(portfolio_ids)))
        ],
        "portfolio_adjust_advice_item": [
            {"id": item.id, "executed_quantity": item.executed_quantity, "execution_status": item.execution_status}
            for item in result["advice_items"]
        ],
        "portfolio_value_snapshot": [
            _row(s)
            for s in db.scalars(
                select(PortfolioValueSnapshot).where(
                    PortfolioValueSnapshot.portfolio_id.in_(portfolio_ids), PortfolioValueSnapshot.snapshot_date == day
                )
            )
        ],
    }
    path = recovery_dir / f"purge-trades-{day}-{stamp}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"已导出要改动的行：{path}")
    return path


def apply(db: Session, day: date, result: dict) -> None:
    for p in result["positions"]:
        position, target = p["position"], p["target"]
        if target == 0:
            if position is not None:
                db.delete(position)
        elif position is None:
            price = p["last_price"]
            db.add(
                PortfolioPosition(
                    portfolio_id=p["portfolio_id"],
                    stock_id=p["stock_id"],
                    quantity=target,
                    current_price=price,
                    market_value=target * price if price else None,
                    status="active",
                )
            )
        else:
            position.quantity = target
            if position.current_price is not None:
                position.market_value = target * position.current_price
    for _, flow in result["flows"]:
        balance = service._cash_balance_model(db, flow.portfolio_id)
        balance.amount = float(balance.amount or 0) - float(flow.amount)
        db.delete(flow)
    for change in result["changes"]:
        db.delete(change)
    db.flush()
    for item in result["advice_items"]:
        adjust_advice.refresh_item_execution(db, item.id)
    db.commit()
    # 快照按当前持仓和现价重算，只对今天有意义；历史日期的快照留给人工核对
    if day == service._today_shanghai():
        for pid in {p["portfolio_id"] for p in result["positions"]}:
            service.upsert_value_snapshot(db, pid, snapshot_date=day, source="manual")
    else:
        print(f"⚠ {day} 不是今天，组合市值快照未重算")


def main() -> None:
    parser = argparse.ArgumentParser(description="撤销某一天记的调仓，恢复持仓和现金")
    parser.add_argument("--date", type=date.fromisoformat, default=None, help="调仓日期，默认今天（上海时区）")
    parser.add_argument("--portfolio-id", type=int, default=None, help="只处理某个组合")
    parser.add_argument("--apply", action="store_true", help="备份后真正执行；不加只预览")
    args = parser.parse_args()
    day = args.date or service._today_shanghai()

    db = SessionLocal()
    print(f"数据库：{engine.url.render_as_string(hide_password=True)}")
    result = plan(db, day, args.portfolio_id)
    print_plan(db, day, result)
    if not result["changes"]:
        return
    if result["errors"]:
        print("存在对不上的记录，已中止。请先人工核对。")
        sys.exit(1)
    if not args.apply:
        print("\n以上为预览，确认无误后加 --apply 执行。")
        return
    backup(db, day, result)
    apply(db, day, result)
    print("已完成。")


if __name__ == "__main__":
    main()
