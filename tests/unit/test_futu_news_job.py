from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.market_radar import futu_client, jobs
from invest_assistant.modules.market_radar.futu_client import FutuFlashPage
from invest_assistant.modules.market_radar.models import SourceItem


def make_temp_session(tmp_path):
    db_path = tmp_path / "futu_news.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def futu_news(news_id: int, level: int = 0, title: str = "") -> dict:
    return {
        "id": str(news_id),
        "title": title,
        "content": f"富途快讯内容 {news_id}",
        "time": str(1790000000 + news_id),
        "detailUrl": f"https://news.futunn.com/flash/{news_id}/example",
        "level": level,
    }


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        return self.payload


def test_fetch_futu_flash_page_passes_cursor_and_timeout(monkeypatch):
    calls = []

    def fake_get(url, params, headers, timeout):
        calls.append({"url": url, "params": params, "timeout": timeout})
        return FakeResponse({
            "code": 0,
            "data": {"data": {"news": [futu_news(2)], "seqMark": "next-mark", "hasMore": True}},
        })

    monkeypatch.setattr(futu_client.requests, "get", fake_get)

    page = futu_client.fetch_futu_flash_page(seq_mark="prev-mark", page_size=100)

    assert page.news == [futu_news(2)]
    assert page.next_seq_mark == "next-mark"
    assert page.has_more is True
    assert calls[0]["url"] == futu_client.FUTU_FLASH_URL
    assert calls[0]["params"] == {"pageSize": "100", "seqMark": "prev-mark"}
    # akshare 那一层没设超时，接口卡住任务就一直挂着
    assert calls[0]["timeout"] == futu_client.FUTU_REQUEST_TIMEOUT_SECONDS


def test_fetch_futu_flash_page_reports_blocked_and_error_codes(monkeypatch):
    monkeypatch.setattr(futu_client.requests, "get", lambda *args, **kwargs: FakeResponse({}, status_code=429))
    try:
        futu_client.fetch_futu_flash_page()
    except RuntimeError as exc:
        assert "HTTP 429" in str(exc)
    else:
        raise AssertionError("HTTP 429 should raise")

    monkeypatch.setattr(
        futu_client.requests,
        "get",
        lambda *args, **kwargs: FakeResponse({"code": -1, "message": "busy"}),
    )
    try:
        futu_client.fetch_futu_flash_page()
    except RuntimeError as exc:
        assert "code=-1" in str(exc)
    else:
        raise AssertionError("non-zero code should raise")


def test_normalize_futu_row_maps_raw_fields_and_level():
    payload = jobs._normalize_futu_row(
        {
            "title": "美股三大指数集体走高",
            "content": "科技股带动市场风险偏好回升。",
            "time": "1779800619",
            "detailUrl": "https://news.futunn.com/flash/20349067/example",
            "level": 1,
        }
    )

    assert payload is not None
    assert payload.source_type == "news"
    assert payload.source_name == "富途牛牛"
    assert payload.title == "美股三大指数集体走高"
    assert payload.content == "科技股带动市场风险偏好回升。"
    assert payload.source_url == "https://news.futunn.com/flash/20349067/example"
    assert payload.is_important is True
    # Unix 秒按绝对时刻换算，不依赖运行机器的本地时区
    assert payload.publish_time == datetime.fromtimestamp(1779800619, tz=timezone.utc)
    assert payload.publish_time.utcoffset().total_seconds() == 8 * 3600


def test_normalize_futu_row_falls_back_and_skips_empty_rows():
    fallback_payload = jobs._normalize_futu_row(
        {"title": "", "content": "匈牙利央行将继续确保实际利率为正。", "time": "", "detailUrl": "", "level": 0}
    )

    assert fallback_payload is not None
    assert fallback_payload.title == "匈牙利央行将继续确保实际利率为正。"
    assert fallback_payload.content == "匈牙利央行将继续确保实际利率为正。"
    assert fallback_payload.publish_time is None
    assert fallback_payload.source_url is None
    assert fallback_payload.is_important is False
    assert jobs._normalize_futu_row({"title": "", "content": "", "time": "", "detailUrl": ""}) is None


def test_fetch_futu_news_job_pages_until_stored_news(monkeypatch, tmp_path):
    SessionLocal = make_temp_session(tmp_path)
    monkeypatch.setattr(jobs, "SessionLocal", SessionLocal)
    # 从新到旧三页，第一次抓取没有存量，翻到 hasMore=false 为止
    pages = {
        None: FutuFlashPage(news=[futu_news(6, level=1), futu_news(5)], next_seq_mark="m1", has_more=True),
        "m1": FutuFlashPage(news=[futu_news(4), futu_news(3)], next_seq_mark="m2", has_more=True),
        "m2": FutuFlashPage(news=[futu_news(2), futu_news(1)], next_seq_mark=None, has_more=False),
    }
    requested = []

    def fake_page(seq_mark=None, page_size=100):
        requested.append(seq_mark)
        return pages[seq_mark]

    monkeypatch.setattr(jobs, "fetch_futu_flash_page", fake_page)

    first = jobs.fetch_futu_news_job(limit=300)

    assert requested == [None, "m1", "m2"]
    assert first.success is True
    assert first.inserted_count == 6

    # 第二次：最新一页冒出两条新的，第二页就接上了存量，不再往下翻
    pages[None] = FutuFlashPage(news=[futu_news(8), futu_news(7)], next_seq_mark="n1", has_more=True)
    pages["n1"] = FutuFlashPage(news=[futu_news(6, level=1), futu_news(5)], next_seq_mark="m1", has_more=True)
    requested.clear()

    second = jobs.fetch_futu_news_job(limit=300)

    assert requested == [None, "n1"]
    assert second.inserted_count == 2
    assert second.skipped_count == 2

    db = SessionLocal()
    try:
        items = db.query(SourceItem).all()
    finally:
        db.close()
    assert len(items) == 8
    assert {item.source_url for item in items if item.is_important} == {"https://news.futunn.com/flash/6/example"}


def test_fetch_futu_news_job_respects_limit(monkeypatch, tmp_path):
    monkeypatch.setattr(jobs, "SessionLocal", make_temp_session(tmp_path))
    requested = []

    def fake_page(seq_mark=None, page_size=100):
        requested.append((seq_mark, page_size))
        start = 100 - len(requested) * 2
        return FutuFlashPage(news=[futu_news(start + 1), futu_news(start)][:page_size], next_seq_mark="more", has_more=True)

    monkeypatch.setattr(jobs, "fetch_futu_flash_page", fake_page)

    result = jobs.fetch_futu_news_job(limit=3)

    assert result.fetched_count == 3
    assert requested == [(None, 3), ("more", 1)]


def test_fetch_futu_news_job_reports_fetch_failure(monkeypatch, tmp_path):
    monkeypatch.setattr(jobs, "SessionLocal", make_temp_session(tmp_path))

    def failing_page(seq_mark=None, page_size=100):
        raise RuntimeError("failed to fetch Futu news: HTTP 429")

    monkeypatch.setattr(jobs, "fetch_futu_flash_page", failing_page)

    result = jobs.fetch_futu_news_job()

    assert result.success is False
    assert "HTTP 429" in result.message


def test_futu_news_job_is_registered_with_limit_schema():
    job = next(item for item in jobs.JOBS if item.job_name == "market_radar.fetch_futu_news")

    assert job.display_name == "抓取富途快讯"
    assert job.description == "抓取富途牛牛快讯并写入 source_item"
    assert job.handler is jobs.fetch_futu_news_job
    assert job.trigger_type == "both"
    assert job.params_schema == {"limit": {"type": "number", "label": "最多快讯条数", "default": 300, "min": 1}}
    assert job.tags == ["news", "futu", "market_radar"]
