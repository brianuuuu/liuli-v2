from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.stock_analysis import jobs as stock_jobs
from invest_assistant.modules.stock_analysis import service as stock_service
from invest_assistant.modules.stock_analysis.models import MarketIndexRealtimeQuote


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    import invest_assistant.modules.basic.auth.models  # noqa: F401
    import invest_assistant.modules.basic.ai_audit.models  # noqa: F401
    import invest_assistant.modules.basic.disclosure_library.models  # noqa: F401
    import invest_assistant.modules.basic.job_center.models  # noqa: F401
    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.basic.system_config.models  # noqa: F401
    import invest_assistant.modules.alert_center.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.market_radar.models  # noqa: F401
    import invest_assistant.modules.portfolio.models  # noqa: F401
    import invest_assistant.modules.stock_analysis.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def test_refresh_major_indices_realtime_upserts_six_index_quotes(monkeypatch):
    db = make_session()
    quote_time = datetime(2026, 6, 25, 10, 31, 26)

    monkeypatch.setattr(
        stock_service.tushare_client,
        "fetch_realtime_index_quote_rows",
        lambda codes: [
            {
                "code": code,
                "price": 3000 + index,
                "change": 10 + index,
                "pct_chg": 0.1 + index,
                "quote_time": quote_time,
                "source": "tushare.realtime_quote",
            }
            for index, code in enumerate(codes)
        ],
    )

    result = stock_service.refresh_major_indices_realtime(db)
    rows = db.query(MarketIndexRealtimeQuote).order_by(MarketIndexRealtimeQuote.code.asc()).all()

    assert result.success is True
    assert result.processed_count == 6
    assert len(rows) == 6
    assert {row.status for row in rows} == {"success"}
    assert {row.source for row in rows} == {"tushare.realtime_quote"}


def test_refresh_major_indices_realtime_records_error_status(monkeypatch):
    db = make_session()

    def fail(_codes):
        raise RuntimeError("tushare unavailable")

    monkeypatch.setattr(stock_service.tushare_client, "fetch_realtime_index_quote_rows", fail)

    result = stock_service.refresh_major_indices_realtime(db)
    rows = db.query(MarketIndexRealtimeQuote).all()

    assert result.success is False
    assert result.processed_count == 6
    assert len(rows) == 6
    assert {row.status for row in rows} == {"failed"}
    assert all(row.error_message == "tushare unavailable" for row in rows)


def test_major_indices_job_registered():
    definition = next(job for job in stock_jobs.JOBS if job.job_name == "stock_analysis.refresh_major_indices_realtime")

    assert definition.module_name == "stock_analysis"
    assert definition.trigger_type == "manual"
    assert definition.display_name == "刷新A股主要指数实时行情"
