import json
from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.report_library import service as report_service
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.models import KnowledgeResearchFeedback
from invest_assistant.modules.knowledge_base.schemas import KnowledgeResearchFeedbackCreate
from invest_assistant.modules.knowledge_base.service import (
    create_research_feedback,
    import_research_feedback,
    list_research_feedback,
)
from invest_assistant.modules.portfolio import adjust_advice
from invest_assistant.modules.portfolio.models import (
    Portfolio,
    PortfolioAdjustAdvice,
    PortfolioAdjustAdviceItem,
    PortfolioPositionChange,
)
from invest_assistant.modules.stock_analysis.models import MarketIndexDailyBar, StockDailyBar


T = date(2026, 10, 12)


def make_session() -> Session:
    """内存库，不碰 var/db 下的任何文件。"""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.alert_center.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.portfolio.models  # noqa: F401
    import invest_assistant.modules.stock_analysis.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def create_feedback(db: Session, title: str, markdown: str, *, researcher_code: str) -> KnowledgeResearchFeedback:
    report, _size = report_service.create_markdown_report_file_and_index(
        db, title=title, source_module="portfolio", markdown=markdown
    )
    return create_research_feedback(
        db,
        KnowledgeResearchFeedbackCreate(
            title=title,
            report_id=report.id,
            report_path=report.file_path,
            researcher_code=researcher_code,
            business_module="portfolio",
            source="mcp",
            status="received",
        ),
    )


def trading_days(start: date, count: int) -> list[date]:
    days, day = [], start
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    return days


def advice_markdown(**overrides) -> str:
    return as_markdown(advice_payload(**overrides))


def as_markdown(payload: dict) -> str:
    return "今日是否有微操机会：有。\n\n```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```\n"


def advice_payload(**overrides) -> dict:
    payload = {
        "portfolio_id": 1,
        "researcher_code": "portfolio_001",
        "data_as_of_date": "2026-10-09",
        "news_as_of": "2026-10-09T20:30+08:00",
        "target_trade_date": T.isoformat(),
        "has_opportunity": True,
        "snapshot": {"total_asset": 875088.13, "stock_value": 866348.46, "cash": 8739.67},
        "cash_ratio_before": 0.01,
        "cash_ratio_after": 0.0373,
        "continuity_note": "未取得历史建议。",
        "items": [
            {
                "company_code": "601021",
                "company_name": "春秋航空",
                "action": "reduce",
                "rating": 4,
                "quantity": 600,
                "quantity_before": 3600,
                "price_low": 40.0,
                "price_high": 41.5,
                "signal_codes": ["above_value_center", "overextension"],
                "core_logic": "进入中枢上方，分批减持。",
                "value_position": {"long_trend": "up", "bias60_pct": 0.91, "value_zone": "far_above"},
                "risk_alert": {"risk_level": "none", "risk_codes": [], "summary": None, "change": "unchanged"},
            },
            {
                "company_code": "600036.SH",
                "company_name": "招商银行",
                "action": "wait",
                "rating": 3,
                "signal_codes": [],
                "core_logic": "年线拐头，等待。",
                "value_position": {"long_trend": "down", "bias60_pct": 1.7, "value_zone": "unknown_zone"},
                "risk_alert": {
                    "risk_level": "warning",
                    "risk_codes": ["value_trend_down", "made_up_code"],
                    "summary": "年线拐头向下。",
                    "implication": "不增持。",
                    "change": "new",
                },
            },
        ],
    }
    payload.update(overrides)
    return payload


def seed(db) -> None:
    db.add(Portfolio(name="实盘组合"))
    db.add(Stock(stock_code="601021", stock_name="春秋航空", symbol="601021.SH", exchange="SH"))
    db.add(Stock(stock_code="600036", stock_name="招商银行", symbol="600036.SH", exchange="SH"))
    db.commit()


def import_report(db, title="实盘组合-2026-10-09-微操报告", markdown=None):
    feedback = create_feedback(db, title, markdown or advice_markdown(), researcher_code="portfolio_001")
    return feedback, import_research_feedback(db, feedback.id)


def test_import_adjust_advice_report(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    feedback = create_feedback(db, "实盘组合-2026-10-09-微操报告", advice_markdown(), researcher_code="portfolio_001")
    assert [item.id for item in list_research_feedback(db, pending_import=True)] == [feedback.id]

    result = import_research_feedback(db, feedback.id)

    assert result["target"] == "portfolio_adjust_advice"
    assert result["message"] == "微操报告导入成功：2 只持仓，1 条风险警示"
    advice = db.scalar(select(PortfolioAdjustAdvice))
    assert advice.target_trade_date == T
    assert advice.data_as_of_date == date(2026, 10, 9)
    assert advice.total_asset == 875088.13 and advice.cash == 8739.67
    assert advice.status == "active"
    reduce_item, wait_item = db.scalars(select(PortfolioAdjustAdviceItem).order_by(PortfolioAdjustAdviceItem.id)).all()
    assert (reduce_item.action, reduce_item.quantity, reduce_item.price_low) == ("reduce", 600, 40.0)
    assert reduce_item.primary_signal_code == "above_value_center"
    assert reduce_item.value_zone == "far_above" and reduce_item.bias60_pct == 0.91
    assert reduce_item.alert_event_id is None
    # 证券代码带交易所后缀也能解析；越界的分位、未知的区域和风险代码一律退化成空
    assert wait_item.stock_id == 2
    assert wait_item.bias60_pct is None and wait_item.value_zone is None
    assert wait_item.risk_level == "warning" and wait_item.primary_risk_code == "value_trend_down"
    alert = db.get(AlertEvent, wait_item.alert_event_id)
    assert alert.status == "unread" and alert.event_level == "warning"
    assert alert.title == "微操风险警示｜招商银行（600036）"
    assert "年线拐头向下" in alert.message and "不增持" in alert.message
    assert json.loads(wait_item.detail_json)["core_logic"] == "年线拐头，等待。"
    assert db.get(KnowledgeResearchFeedback, feedback.id).status == "parsed"


def test_reimport_same_trade_date_supersedes_previous(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    import_report(db)
    import_report(db, title="实盘组合-2026-10-10-微操报告")

    statuses = db.scalars(select(PortfolioAdjustAdvice.status).order_by(PortfolioAdjustAdvice.id)).all()
    assert statuses == ["superseded", "active"]


def test_risk_alert_only_raised_when_new_or_upgraded(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)

    def report(day: date, level: str):
        payload = advice_payload(target_trade_date=day.isoformat())
        payload["items"][1]["risk_alert"]["risk_level"] = level
        title = f"实盘组合-{day.isoformat()}-微操报告"
        feedback = create_feedback(db, title, as_markdown(payload), researcher_code="portfolio_001")
        import_research_feedback(db, feedback.id)

    def alert_count() -> int:
        return db.scalar(select(func.count(AlertEvent.id)))

    report(T, "warning")
    assert alert_count() == 1
    # 次日维持同级警示：入库但不再推送
    report(T + timedelta(days=1), "warning")
    assert alert_count() == 1
    # 同日重导与被作废的那份比较，也不重复推送
    report(T + timedelta(days=1), "warning")
    assert alert_count() == 1
    # 升级为严重：推送
    report(T + timedelta(days=2), "severe")
    assert alert_count() == 2
    # 降到观察后再回到警示：算新出现，推送
    report(T + timedelta(days=3), "watch")
    report(T + timedelta(days=4), "warning")
    assert alert_count() == 3
    warning_items = db.scalars(
        select(PortfolioAdjustAdviceItem).where(PortfolioAdjustAdviceItem.risk_level.in_(("warning", "severe")))
    ).all()
    # 不推送的警示照常入库，参与命中率评估
    assert len(warning_items) == 5


def test_import_rejects_invalid_item_without_partial_rows(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    bad = advice_markdown(items=[{"company_code": "601021", "action": "sell"}])
    feedback = create_feedback(db, "实盘组合-2026-10-09-微操报告", bad, researcher_code="portfolio_001")

    with pytest.raises(ValueError, match="action 取值无效"):
        import_research_feedback(db, feedback.id)

    assert db.scalar(select(func.count(PortfolioAdjustAdvice.id))) == 0
    assert db.get(KnowledgeResearchFeedback, feedback.id).status == "received"


def test_import_requires_prices_for_directional_items(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    bad = advice_markdown(items=[{"company_code": "601021", "action": "add", "quantity": 100}])
    feedback = create_feedback(db, "实盘组合-2026-10-09-微操报告", bad, researcher_code="portfolio_001")

    with pytest.raises(ValueError, match="price_low 和 price_high"):
        import_research_feedback(db, feedback.id)


def seed_bars(db, days: list[date]) -> None:
    for index, day in enumerate(days):
        db.add(MarketIndexDailyBar(code="000300.SH", name="沪深300", trade_date=day, open=4000, high=4000, low=4000, close=4000 + index))
        # 春秋航空：T 日最高 41 触及减持下沿 40，此后单边下跌
        spring = 40.0 - 0.1 * index
        db.add(StockDailyBar(stock_id=1, ts_code="601021.SH", trade_date=day, open=spring, high=41.0 if index == 0 else spring, low=spring, close=spring))
        bank = 30.0 - 0.06 * index
        db.add(StockDailyBar(stock_id=2, ts_code="600036.SH", trade_date=day, open=bank, high=bank, low=bank, close=bank))
    db.commit()


def test_evaluate_fills_execution_returns_and_verdicts(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    import_report(db)
    days = trading_days(T, 70)
    db.add(PortfolioPositionChange(portfolio_id=1, stock_id=1, quantity_before=3600, quantity_after=3000, quantity_delta=-600, change_date=T))
    seed_bars(db, days[:21])

    result = adjust_advice.evaluate_adjust_advice(db)

    assert result == {"processed_count": 2, "updated_count": 2}
    reduce_item, wait_item = db.scalars(select(PortfolioAdjustAdviceItem).order_by(PortfolioAdjustAdviceItem.id)).all()
    assert reduce_item.trigger_status == "touched"
    assert reduce_item.execution_status == "executed" and reduce_item.executed_quantity == 600
    assert reduce_item.base_price == 40.0
    assert reduce_item.return_5d == pytest.approx(39.5 / 40 - 1)
    assert reduce_item.return_20d == pytest.approx(38.0 / 40 - 1)
    assert reduce_item.return_60d is None
    assert reduce_item.verdict == "correct"
    assert reduce_item.risk_verdict is None
    assert wait_item.trigger_status == "n_a" and wait_item.execution_status is None
    assert wait_item.verdict is None
    # 20 日跌 4%，沪深300 涨 0.5%，跑输超过 3%
    assert wait_item.risk_verdict == "hit"

    # 可重复执行：没有新数据时不改动已算好的结果
    assert adjust_advice.evaluate_adjust_advice(db) == {"processed_count": 2, "updated_count": 0}


def test_evaluate_skips_until_trade_date_has_bars(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    import_report(db)
    db.add(MarketIndexDailyBar(code="000300.SH", name="沪深300", trade_date=T - timedelta(days=3), open=1, high=1, low=1, close=1))
    db.commit()

    assert adjust_advice.evaluate_adjust_advice(db) == {"processed_count": 2, "updated_count": 0}
    assert db.scalar(select(PortfolioAdjustAdviceItem.trigger_status).limit(1)) is None


def test_reviews_count_unexecuted_repeats_once(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    days = trading_days(T, 70)
    # 连续两天对春秋航空建议减持且都没执行，统计里只算第一条
    import_report(db)
    repeat = advice_payload(target_trade_date=days[1].isoformat())
    repeat["items"][0]["price_low"] = 39.0  # 第二天同样触及区间，不去重就会算两次
    import_report(db, title="实盘组合-2026-10-12-微操报告", markdown=as_markdown(repeat))
    seed_bars(db, days[:22])
    adjust_advice.evaluate_adjust_advice(db)

    review = adjust_advice.list_adjust_advice_reviews(db, portfolio_id=1, limit=1)

    assert len(review["reports"]) == 1
    assert review["summary"] == {
        "report_count": 2,
        "advice_count": 2,
        "executed_count": 0,
        "tracked_count": 2,
        "pending_count": 0,
        "alert_count": 2,
    }
    assert review["reports"][0]["target_trade_date"] == days[1]
    first_item = review["reports"][0]["items"][0]
    assert first_item["stock_name"] == "春秋航空" and first_item["core_logic"] == "进入中枢上方，分批减持。"
    assert review["signal_stats"]["by_signal"] == [
        {
            "action": "reduce",
            "signal_code": "above_value_center",
            "samples": 1,
            "correct": 1,
            "wrong": 0,
            "neutral": 0,
            "win_rate": 1.0,
            "avg_effect_20d": pytest.approx(0.05),
        }
    ]
    assert review["signal_stats"]["by_category"][0]["category"] == "value"
    assert review["risk_stats"] == [{"risk_code": "value_trend_down", "samples": 2, "hits": 2, "hit_rate": 1.0}]


def test_reviews_reject_unknown_portfolio():
    db = make_session()
    with pytest.raises(FileNotFoundError):
        adjust_advice.list_adjust_advice_reviews(db, portfolio_id=99)


def test_report_without_portfolio_id_covers_all_portfolios(tmp_path, monkeypatch):
    """研究员按所有账户的合计持仓出报告：不写 portfolio_id，执行匹配跨组合找调仓。"""
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    db.add(Portfolio(name="华泰证券2"))
    db.commit()
    payload = advice_payload()
    payload.pop("portfolio_id")
    import_report(db, markdown=as_markdown(payload))
    # 减持发生在第二个组合
    db.add(PortfolioPositionChange(portfolio_id=2, stock_id=1, quantity_before=3600, quantity_after=3300, quantity_delta=-300, change_date=T))
    seed_bars(db, trading_days(T, 6))

    adjust_advice.evaluate_adjust_advice(db)

    advice = db.scalar(select(PortfolioAdjustAdvice))
    assert advice.portfolio_id is None
    reduce_item = db.scalar(select(PortfolioAdjustAdviceItem).order_by(PortfolioAdjustAdviceItem.id).limit(1))
    assert reduce_item.execution_status == "partial" and reduce_item.executed_quantity == 300
    assert len(adjust_advice.list_adjust_advice_reviews(db)["reports"]) == 1
    # 指定单个组合时不含全部组合口径的报告
    assert adjust_advice.list_adjust_advice_reviews(db, portfolio_id=1)["reports"] == []


def test_import_rejects_unknown_portfolio_id(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    feedback = create_feedback(db, "实盘组合-2026-10-09-微操报告", advice_markdown(portfolio_id=9), researcher_code="portfolio_001")

    with pytest.raises(ValueError, match="未找到组合: portfolio_id=9"):
        import_research_feedback(db, feedback.id)


def test_linked_position_change_drives_execution_and_review(tmp_path, monkeypatch):
    from invest_assistant.modules.portfolio import position_change_review, service as portfolio_service

    monkeypatch.chdir(tmp_path)
    db = make_session()
    seed(db)
    import_report(db)
    days = trading_days(T, 70)
    # 关联调仓在 T+1，要多一天日线才算得出它的 20 日收益
    seed_bars(db, days[:22])
    reduce_item = db.scalar(select(PortfolioAdjustAdviceItem).where(PortfolioAdjustAdviceItem.action == "reduce"))

    candidates = adjust_advice.list_advice_candidates(db, stock_id=1, change_date=days[1], portfolio_id=1)
    assert [row["id"] for row in candidates] == [reduce_item.id]
    assert candidates[0]["core_logic"] == "进入中枢上方，分批减持。"
    assert adjust_advice.list_advice_candidates(db, stock_id=2, change_date=days[1]) == []

    adjust_advice.evaluate_adjust_advice(db)
    assert reduce_item.execution_status == "not_executed"

    # T+1 才执行、手动关联建议：不按日期推断也算执行，并且立即重算
    linked = portfolio_service.record_position_change(
        db, 1, 1, quantity_before=3600, quantity_after=3000, change_date=days[1], price=40.2, advice_item_id=reduce_item.id
    )
    db.commit()
    assert linked.reason_type == "ai_advice" and linked.price_source == "manual"
    assert reduce_item.execution_status == "executed" and reduce_item.executed_quantity == 600

    # 留空价格按调仓日前复权收盘价估算；公司行为不估价
    personal = portfolio_service.record_position_change(
        db, 1, 1, quantity_before=3000, quantity_after=3500, change_date=days[0], reason_type="personal"
    )
    corporate = portfolio_service.record_position_change(
        db, 1, 2, quantity_before=1000, quantity_after=1300, change_date=days[0], reason_type="corporate_action"
    )
    db.commit()
    assert personal.price == 40.0 and personal.price_source == "estimated"
    assert corporate.price is None and corporate.price_source is None

    with pytest.raises(ValueError):
        portfolio_service.record_position_change(db, 1, 2, quantity_before=0, quantity_after=1, advice_item_id=reduce_item.id)
    with pytest.raises(ValueError):
        portfolio_service.record_position_change(db, 1, 2, quantity_before=0, quantity_after=1, reason_type="guess")

    listed = {row["id"]: row for row in portfolio_service.list_position_changes(db, 1)}
    assert listed[linked.id]["advice_action"] == "reduce" and listed[linked.id]["advice_target_trade_date"] == T

    review = position_change_review.review_position_changes(db, portfolio_id=1)
    rows = {(row["reason_type"], row["action"]): row for row in review["rows"]}
    assert set(rows) == {("ai_advice", "reduce"), ("personal", "add")}
    # 春秋航空单边下跌：减仓对，加仓错
    assert rows[("ai_advice", "reduce")]["correct"] == 1
    assert rows[("personal", "add")]["wrong"] == 1 and rows[("personal", "add")]["win_rate"] == 0
