from datetime import date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.disclosure_library.models import CompanyDisclosure
from invest_assistant.modules.basic.disclosure_library.periodic_report import (
    guess_disclosure_type,
    normalize_report_period,
    periodic_report_period,
)
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.stock_analysis import service
from invest_assistant.modules.stock_analysis.models import (
    StockPoolItem,
    StockScoreSnapshot,
    StockTrendSnapshot,
    StockValuationSnapshot,
)


def make_session() -> Session:
    """内存库，测试结束即丢，不碰任何持久数据库。"""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    import invest_assistant.modules.basic.disclosure_library.models  # noqa: F401
    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.market_radar.models  # noqa: F401
    import invest_assistant.modules.stock_analysis.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def test_periodic_report_period_only_accepts_full_report_titles():
    assert periodic_report_period("万东医疗2026年半年度报告") == "2026-Q2"
    assert periodic_report_period("万东医疗2026年第三季度报告") == "2026-Q3"
    assert periodic_report_period("2026年第一季度报告") == "2026-Q1"
    assert periodic_report_period("2025年年度报告") == "2025-Q4"
    assert periodic_report_period("2026年 第三季度报告") == "2026-Q3"
    for title in (
        "万东医疗2026年半年度报告摘要",
        "2025年年度报告（英文版）",
        "2026年半年度报告（更正后）",
        "关于2026年第三季度报告的问询函",
        "2026年前三季度业绩预告",
        "2026年半年度业绩快报",
    ):
        assert periodic_report_period(title) is None, title


def test_guess_disclosure_type_no_longer_reads_interim_as_annual():
    assert guess_disclosure_type("万东医疗2026年半年度报告") == "interim_report"
    assert guess_disclosure_type("万东医疗2026年半年度报告摘要") == "interim_report"
    assert guess_disclosure_type("2025年年度报告") == "annual_report"
    assert guess_disclosure_type("2026年第三季度报告") == "quarterly_report"


def test_normalize_report_period():
    assert normalize_report_period("2026q3") == "2026-Q3"
    assert normalize_report_period(" 2026-Q2 ") == "2026-Q2"
    assert normalize_report_period("2026H1") is None


def _add_stock(db: Session, code: str, status: str = "focused") -> Stock:
    stock = Stock(stock_code=code, stock_name=f"标的{code}")
    db.add(stock)
    db.flush()
    db.add(StockPoolItem(stock_id=stock.id, status=status))
    return stock


def _add_report(db: Session, stock: Stock, title: str, published: datetime, disclosure_type: str = "quarterly_report") -> None:
    db.add(CompanyDisclosure(stock_id=stock.id, source="cninfo", disclosure_type=disclosure_type, title=title, publish_time=published))


def _add_research(db: Session, stock: Stock, period: str, day: date, *, valuation=True, score=True, trend=True) -> None:
    if valuation:
        db.add(StockValuationSnapshot(stock_id=stock.id, report_period=period, analysis_date=day))
    if score:
        db.add(StockScoreSnapshot(stock_id=stock.id, report_time=day))
    if trend:
        db.add(StockTrendSnapshot(stock_id=stock.id, research_date=day, trend_level="A"))


def _follow_ups(db: Session, status: str | None = None) -> dict[str, dict | None]:
    return {row["stock_code"]: row["earnings_follow_up"] for row in service.list_pool(db, status=status)}


def test_pool_flags_stocks_until_valuation_score_and_trend_cover_new_report():
    db = make_session()
    released = datetime(2026, 10, 24)
    pending = _add_stock(db, "600055")
    _add_report(db, pending, "万东医疗2026年第三季度报告", released)
    _add_report(db, pending, "万东医疗2026年半年度报告", datetime(2026, 8, 26), "annual_report")
    # 估值做到了当期，评分是财报前做的，趋势没做
    _add_research(db, pending, "2026-Q3", date(2026, 10, 25), score=False, trend=False)
    db.add(StockScoreSnapshot(stock_id=pending.id, report_time=date(2026, 10, 20)))

    done = _add_stock(db, "600000")
    _add_report(db, done, "2026年第三季度报告", released)
    _add_research(db, done, "2026q3", date(2026, 10, 24))

    stale_valuation = _add_stock(db, "600001")
    _add_report(db, stale_valuation, "2026年第三季度报告", released)
    _add_research(db, stale_valuation, "2026-Q2", date(2026, 10, 26))
    db.commit()

    result = _follow_ups(db)

    assert result["600055"]["report_period"] == "2026-Q3"
    assert result["600055"]["publish_date"] == date(2026, 10, 24)
    assert result["600055"]["missing"] == ["score", "trend"]
    assert result["600000"] is None
    assert result["600001"]["missing"] == ["valuation"]


def test_pool_ignores_reports_before_start_period_summaries_and_archived_stocks():
    db = make_session()
    old = _add_stock(db, "000001")
    _add_report(db, old, "2026年半年度报告", datetime(2026, 8, 26), "interim_report")
    summary_only = _add_stock(db, "000002")
    _add_report(db, summary_only, "2026年第三季度报告摘要", datetime(2026, 10, 24))
    archived = _add_stock(db, "000003", status="archived")
    _add_report(db, archived, "2026年第三季度报告", datetime(2026, 10, 24))
    db.commit()

    assert _follow_ups(db) == {"000001": None, "000002": None}
    assert _follow_ups(db, status="archived") == {"000003": None}
