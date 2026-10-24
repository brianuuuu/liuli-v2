"""微操报告的大盘与整体仓位判断：导入落列、非法值退化为空、按沪深300 事后评估方向。全部用内存库。"""

from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import invest_assistant.modules.alert_center.models  # noqa: F401
import invest_assistant.modules.basic.report_library.models  # noqa: F401
import invest_assistant.modules.basic.stock_master.models  # noqa: F401
import invest_assistant.modules.market_radar.models  # noqa: F401
import invest_assistant.modules.portfolio.models  # noqa: F401
import invest_assistant.modules.stock_analysis.models  # noqa: F401
import invest_assistant.modules.track_discovery.models  # noqa: F401
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.portfolio import adjust_advice
from invest_assistant.modules.stock_analysis.models import MarketIndexDailyBar

T0 = date(2026, 6, 1)


def make_session():
    """内存库，不碰 var/db 下的任何文件。"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def payload(day: date, direction: str | None, regime: str = "range", **extra) -> dict:
    data = {
        "data_as_of_date": day.isoformat(),
        "target_trade_date": day.isoformat(),
        "cash_ratio_before": 0.01,
        "cash_ratio_after": 0.04,
        "items": [],
        "market_view": {"market_regime": regime, "market_risk": "none", "value_zone": "around", "summary": "震荡"},
        "position_plan": {"target_stock_ratio_low": 0.75, "target_stock_ratio_high": 0.9, "direction": direction},
    }
    return data | extra


def seed_index(db, closes: list[float]) -> None:
    for offset, close in enumerate(closes):
        day = T0 + timedelta(days=offset)
        db.add(MarketIndexDailyBar(code="000300.SH", name="沪深300", trade_date=day, open=close, high=close, low=close, close=close, source="tushare"))
    db.commit()


def test_import_stores_market_view_and_degrades_invalid_values():
    db = make_session()
    advice = adjust_advice.import_advice(db, payload(T0, "reduce"), feedback_id=1, report_id=None, researcher_code="portfolio_001")
    assert (advice.market_regime, advice.market_risk, advice.position_direction) == ("range", "none", "reduce")
    assert (advice.target_stock_ratio_low, advice.target_stock_ratio_high) == (0.75, 0.9)
    assert "震荡" in advice.market_view_json

    bad = payload(T0 + timedelta(days=1), "sideways", regime="bull")
    bad["position_plan"].update(target_stock_ratio_low=0.95, target_stock_ratio_high=0.8)
    advice = adjust_advice.import_advice(db, bad, feedback_id=2, report_id=None, researcher_code="portfolio_001")
    assert (advice.market_regime, advice.position_direction) == (None, None)
    assert (advice.target_stock_ratio_low, advice.target_stock_ratio_high) == (None, None)

    # 老格式报告没有这两项，照常导入
    old = payload(T0 + timedelta(days=2), None)
    del old["market_view"], old["position_plan"]
    advice = adjust_advice.import_advice(db, old, feedback_id=3, report_id=None, researcher_code="portfolio_001")
    assert advice.market_view_json is None and advice.position_direction is None


def test_market_review_judges_direction_by_index_and_counts_episode_once():
    db = make_session()
    # 沪深300 前 25 天一路跌 10%：减持判断正确
    seed_index(db, [100 - day * 0.4 for day in range(90)])
    adjust_advice.import_advice(db, payload(T0, "reduce"), feedback_id=1, report_id=None, researcher_code="portfolio_001")
    adjust_advice.import_advice(db, payload(T0 + timedelta(days=1), "reduce"), feedback_id=2, report_id=None, researcher_code="portfolio_001")
    adjust_advice.import_advice(db, payload(T0 + timedelta(days=2), "add", regime="downtrend"), feedback_id=3, report_id=None, researcher_code="portfolio_001")
    db.commit()

    review = adjust_advice.list_adjust_advice_reviews(db)["market_review"]

    rows = review["rows"]
    assert [row["position_direction"] for row in rows] == ["add", "reduce", "reduce"]
    assert [row["counted"] for row in rows] == [True, False, True]
    assert rows[-1]["verdict"] == "correct" and rows[0]["verdict"] == "wrong"
    assert rows[-1]["stock_ratio_before"] == 0.99
    stats = {(row["market_regime"], row["direction"]): row for row in review["stats"]}
    assert stats[("range", "reduce")]["samples"] == 1 and stats[("range", "reduce")]["win_rate"] == 1
    assert stats[("downtrend", "add")]["wrong"] == 1

    report = adjust_advice.list_adjust_advice_reviews(db)["reports"][0]
    assert report["market_view"]["value_zone"] == "around"
    assert report["position_direction"] == "add"
