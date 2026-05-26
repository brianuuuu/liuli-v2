import sys
from types import SimpleNamespace
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.market_radar import jobs
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.services.akshare.client import fetch_futu_news_rows


class FakeDataFrame:
    def __init__(self, rows):
        self.rows = rows

    def head(self, limit):
        return FakeDataFrame(self.rows[:limit])

    def iterrows(self):
        return iter(enumerate(self.rows))


def make_temp_session(tmp_path):
    db_path = tmp_path / "futu_news.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def test_fetch_futu_news_rows_calls_akshare_and_limits_rows(monkeypatch):
    rows = [
        {"标题": "第一条", "内容": "内容一", "发布时间": "2026-05-26 21:03:39", "链接": "https://example.com/1"},
        {"标题": "第二条", "内容": "内容二", "发布时间": "2026-05-26 21:03:40", "链接": "https://example.com/2"},
    ]
    fake_akshare = SimpleNamespace(stock_info_global_futu=lambda: FakeDataFrame(rows))
    monkeypatch.setitem(sys.modules, "akshare", fake_akshare)

    assert fetch_futu_news_rows(1) == [rows[0]]


def test_normalize_futu_row_maps_akshare_fields():
    payload = jobs._normalize_futu_row(
        {
            "标题": "美股三大指数集体走高",
            "内容": "科技股带动市场风险偏好回升。",
            "发布时间": "2026-05-26 21:03:39",
            "链接": "https://news.futunn.com/flash/20349067/example",
        }
    )

    assert payload is not None
    assert payload.source_type == "news"
    assert payload.source_name == "富途牛牛"
    assert payload.title == "美股三大指数集体走高"
    assert payload.content == "科技股带动市场风险偏好回升。"
    assert payload.source_url == "https://news.futunn.com/flash/20349067/example"
    assert payload.publish_time == datetime(2026, 5, 26, 21, 3, 39)


def test_normalize_futu_row_falls_back_and_skips_empty_rows():
    fallback_payload = jobs._normalize_futu_row(
        {
            "标题": "",
            "内容": "匈牙利央行将继续确保实际利率为正。",
            "发布时间": "",
            "链接": "",
        }
    )

    assert fallback_payload is not None
    assert fallback_payload.title == "匈牙利央行将继续确保实际利率为正。"
    assert fallback_payload.content == "匈牙利央行将继续确保实际利率为正。"
    assert fallback_payload.publish_time is None
    assert fallback_payload.source_url is None
    assert jobs._normalize_futu_row({"标题": "", "内容": "", "发布时间": "", "链接": ""}) is None


def test_fetch_futu_news_job_inserts_once_and_skips_duplicates(monkeypatch, tmp_path):
    SessionLocal = make_temp_session(tmp_path)
    rows = [
        {
            "标题": "富途快讯标题",
            "内容": "富途快讯内容",
            "发布时间": "2026-05-26 21:03:39",
            "链接": "https://news.futunn.com/flash/20349067/example",
        }
    ]
    monkeypatch.setattr(jobs, "_fetch_futu_rows", lambda limit: rows[:limit])
    monkeypatch.setattr(jobs, "SessionLocal", SessionLocal)

    first = jobs.fetch_futu_news_job(limit=50)
    second = jobs.fetch_futu_news_job(limit=50)

    db = SessionLocal()
    try:
        items = db.query(SourceItem).all()
    finally:
        db.close()

    assert first.success is True
    assert first.fetched_count == 1
    assert first.inserted_count == 1
    assert first.skipped_count == 0
    assert second.success is True
    assert second.fetched_count == 1
    assert second.inserted_count == 0
    assert second.skipped_count == 1
    assert len(items) == 1
    assert items[0].source_name == "富途牛牛"
    assert items[0].source_url == "https://news.futunn.com/flash/20349067/example"


def test_futu_news_job_is_registered_with_limit_schema():
    job = next(item for item in jobs.JOBS if item.job_name == "market_radar.fetch_futu_news")

    assert job.display_name == "抓取富途快讯"
    assert job.description == "抓取富途牛牛快讯并写入 source_item"
    assert job.handler is jobs.fetch_futu_news_job
    assert job.trigger_type == "both"
    assert job.params_schema == {"limit": {"type": "number", "label": "最多快讯条数", "default": 50, "min": 1}}
    assert job.tags == ["news", "futu", "market_radar"]
