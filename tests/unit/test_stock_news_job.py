import json
import sys
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.market_radar import jobs
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.stock_analysis.models import StockPoolItem


def make_session(tmp_path):
    db_path = tmp_path / "stock_news.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})

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
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def eastmoney_jsonp(rows):
    payload = {"code": 0, "hitsTotal": len(rows), "result": {"cmsArticleWebOld": rows}}
    return f"jQuery3510({json.dumps(payload, ensure_ascii=False)})"


def test_fetch_eastmoney_stock_news_rows_paginates_and_normalizes(monkeypatch):
    from invest_assistant.services.akshare import client as akshare_client

    pages = {
        1: [
            {
                "date": "2026-06-01 17:15:00",
                "mediaName": "财中社",
                "code": "202606013756105593",
                "title": "万东医疗回购18<em>0</em>万股",
                "content": "万东医疗（<em>600055</em>）发布公告。\r\n\u3000回购金额2999万元。",
            },
            {
                "date": "2026-05-22 17:08:39",
                "mediaName": "财联社",
                "code": "202605223746795563",
                "title": "万东医疗：取得注册证",
                "content": "取得医疗器械注册证。",
            },
        ],
        2: [
            {
                "date": "2026-04-24 18:13:29",
                "mediaName": "界面新闻",
                "code": "202604243718186010",
                "title": "万东医疗设立全资子公司",
                "content": "布局核心部件研发生产。",
            }
        ],
    }
    requested_pages = []

    def fake_get(_url, params, **_kwargs):
        page = json.loads(params["param"])["param"]["cmsArticleWebOld"]["pageIndex"]
        requested_pages.append(page)
        return SimpleNamespace(text=eastmoney_jsonp(pages.get(page, [])))

    monkeypatch.setattr(akshare_client, "_eastmoney_requests_module", lambda: SimpleNamespace(get=fake_get))

    rows = akshare_client.fetch_eastmoney_stock_news_rows("600055", limit=5, page_size=2)

    assert requested_pages == [1, 2]
    assert len(rows) == 3
    assert rows[0]["新闻标题"] == "万东医疗回购180万股"
    assert rows[0]["新闻内容"] == "万东医疗（600055）发布公告。 回购金额2999万元。"
    assert rows[0]["新闻链接"] == "http://finance.eastmoney.com/a/202606013756105593.html"
    assert rows[0]["关键词"] == "600055"


def test_fetch_stock_news_job_defaults_to_stock_pool_and_records_per_stock(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        pool_stock = Stock(stock_code="600055", stock_name="万东医疗", status="active")
        outside_stock = Stock(stock_code="000001", stock_name="平安银行", status="active")
        db.add_all([pool_stock, outside_stock])
        db.commit()
        db.add(StockPoolItem(stock_id=pool_stock.id, status="focused", source="manual"))
        db.commit()
    finally:
        db.close()

    calls = []

    def fake_fetch(stock_code, limit):
        calls.append((stock_code, limit))
        return [
            {
                "新闻标题": f"{stock_code} 新闻",
                "新闻内容": f"{stock_code} 内容",
                "发布时间": "2026-06-01 17:15:00",
                "文章来源": "财中社",
                "新闻链接": f"http://finance.eastmoney.com/a/{stock_code}.html",
            }
        ]

    from invest_assistant.bootstrap import database as bootstrap_database

    monkeypatch.setitem(sys.modules, "akshare", SimpleNamespace(stock_news_em=lambda **_kwargs: (_ for _ in ()).throw(AssertionError("old AkShare path should not be used"))))
    monkeypatch.setattr(bootstrap_database, "SessionLocal", SessionLocal)
    monkeypatch.setattr(jobs, "SessionLocal", SessionLocal)
    monkeypatch.setattr(jobs, "_fetch_eastmoney_stock_news_rows", fake_fetch, raising=False)

    result = jobs.fetch_stock_news_job(limit=50, sleep_ms=0)

    assert result.success is True
    assert calls == [("600055", 50)]
    assert result.processed_count == 1
    assert result.fetched_count == 1
    assert result.inserted_count == 1
    assert result.skipped_count == 0
    assert result.extra == {
        "target_scope": "stock_pool",
        "per_stock": [
            {"stock_code": "600055", "stock_name": "万东医疗", "fetched": 1, "inserted": 1, "skipped": 0, "error": None}
        ],
    }


def test_fetch_stock_news_job_deduplicates_by_source_url(monkeypatch, tmp_path):
    SessionLocal = make_session(tmp_path)
    db = SessionLocal()
    try:
        stock = Stock(stock_code="600055", stock_name="万东医疗", status="active")
        db.add(stock)
        db.commit()
        db.add(StockPoolItem(stock_id=stock.id, status="focused", source="manual"))
        db.commit()
    finally:
        db.close()

    rows = [
        {
            "新闻标题": "万东医疗回购180万股",
            "新闻内容": "第一条内容",
            "发布时间": "2026-06-01 17:15:00",
            "文章来源": "财中社",
            "新闻链接": "http://finance.eastmoney.com/a/202606013756105593.html",
        },
        {
            "新闻标题": "万东医疗回购股份",
            "新闻内容": "同一 URL 的重复内容",
            "发布时间": "2026-06-01 17:16:00",
            "文章来源": "财中社",
            "新闻链接": "http://finance.eastmoney.com/a/202606013756105593.html",
        },
    ]

    from invest_assistant.bootstrap import database as bootstrap_database

    monkeypatch.setitem(sys.modules, "akshare", SimpleNamespace(stock_news_em=lambda **_kwargs: (_ for _ in ()).throw(AssertionError("old AkShare path should not be used"))))
    monkeypatch.setattr(bootstrap_database, "SessionLocal", SessionLocal)
    monkeypatch.setattr(jobs, "SessionLocal", SessionLocal)
    monkeypatch.setattr(jobs, "_fetch_eastmoney_stock_news_rows", lambda stock_code, limit: rows, raising=False)

    first = jobs.fetch_stock_news_job(limit=50, sleep_ms=0)
    second = jobs.fetch_stock_news_job(limit=50, sleep_ms=0)

    db = SessionLocal()
    try:
        items = list(db.scalars(select(SourceItem).order_by(SourceItem.id.asc())))
    finally:
        db.close()

    assert first.inserted_count == 1
    assert first.skipped_count == 1
    assert second.inserted_count == 0
    assert second.skipped_count == 2
    assert len(items) == 1
    assert items[0].source_url == "http://finance.eastmoney.com/a/202606013756105593.html"


def test_fetch_stock_news_job_registration_defaults_to_fifty_per_stock():
    job = next(item for item in jobs.JOBS if item.job_name == "market_radar.fetch_stock_news")

    assert job.params_schema["limit"] == {"type": "number", "label": "每只股票最多新闻条数", "default": 50, "min": 1}
