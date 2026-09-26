"""舆情批量导入。只用内存 SQLite（新建空库，不清任何已有数据）。"""

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.report_library import models as _report_models  # noqa: F401
from invest_assistant.modules.basic.stock_master import models as _stock_models  # noqa: F401
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.models import SourceItem
from invest_assistant.modules.stock_analysis import models as _stock_analysis_models  # noqa: F401
from invest_assistant.modules.track_discovery import models as _track_models  # noqa: F401
from invest_assistant.shared.time_utils import BEIJING_TZ

NOW = datetime(2026, 9, 26, 15, 30, tzinfo=BEIJING_TZ)


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def item(**overrides) -> dict:
    return {"platform": "雪球", "author": "大V甲", "date": "2026-09-26", "content": "光伏产能出清比预期慢", **overrides}


def test_build_sentiment_source_item_uses_import_time_and_generated_title():
    payload, since = service.build_sentiment_source_item(item(content="  第一行观点\n第二行  ", important=True), NOW)

    assert payload.source_type == "sentiment"
    assert payload.source_name == "雪球"
    assert payload.author == "大V甲"
    assert payload.title == "第一行观点"
    assert payload.content == "第一行观点\n第二行"
    assert payload.publish_time == NOW
    assert payload.is_important is True
    assert payload.source_url is None
    assert since == datetime(2026, 9, 26, 0, 0, tzinfo=BEIJING_TZ)


def test_build_sentiment_source_item_truncates_title_and_content():
    payload, _ = service.build_sentiment_source_item(item(content="观" * 2500), NOW)

    assert len(payload.content) == 2000
    assert payload.title == "观" * 40 + "…"


@pytest.mark.parametrize(
    ("overrides", "reason"),
    [
        ({"platform": "抖音"}, "platform"),
        ({"author": "  "}, "author"),
        ({"content": ""}, "content"),
        ({"date": "2026/09/26"}, "date"),
        ({"date": "2026-09-27"}, "晚于今天"),
    ],
)
def test_build_sentiment_source_item_rejects_invalid_fields(overrides, reason):
    with pytest.raises(ValueError, match=reason):
        service.build_sentiment_source_item(item(**overrides), NOW)


def test_import_sentiment_items_is_idempotent_and_isolates_failures():
    db = make_session()
    batch = [
        item(),
        item(content="同一作者同一天的第二条观点"),
        item(platform="微博", author="大V乙", important=True),
        item(platform="抖音"),
    ]

    first = service.import_sentiment_items(db, batch, now=NOW)
    again = service.import_sentiment_items(db, batch, now=NOW.replace(hour=16))

    assert (first["created"], first["duplicated"]) == (3, 0)
    assert first["failed"] == [{"index": 3, "reason": "platform 只允许 雪球 / 微博 / 知乎"}]
    assert (again["created"], again["duplicated"]) == (0, 3)
    assert again["ids"] == first["ids"]
    rows = db.query(SourceItem).order_by(SourceItem.id).all()
    assert [(row.source_name, row.author, row.is_important) for row in rows] == [
        ("雪球", "大V甲", False),
        ("雪球", "大V甲", False),
        ("微博", "大V乙", True),
    ]


def test_same_content_from_another_author_is_not_a_duplicate():
    db = make_session()
    service.import_sentiment_items(db, [item()], now=NOW)

    result = service.import_sentiment_items(db, [item(author="大V丙")], now=NOW)

    assert result["created"] == 1


def test_import_sentiment_items_rejects_oversized_batch():
    with pytest.raises(ValueError, match="200"):
        service.import_sentiment_items(None, [item()] * 201, now=NOW)


def test_source_item_list_filters_by_author():
    db = make_session()
    service.import_sentiment_items(db, [item(), item(platform="知乎", author="大V乙")], now=NOW)

    page = service.list_source_items_page(db, author="大V乙")

    assert page.total == 1
    assert page.items[0]["author"] == "大V乙"
    assert page.items[0]["source_name"] == "知乎"


def test_mcp_import_sentiment_items_is_controlled_write_tool():
    from invest_assistant.modules.basic.mcp.auth import McpClientConfig
    from invest_assistant.modules.basic.mcp.registry import get_tool_metadata
    from invest_assistant.modules.basic.mcp.tools.market_radar import import_sentiment_items

    metadata = get_tool_metadata("market_radar.import_sentiment_items")
    assert metadata is not None
    assert metadata["read_only"] is False
    assert metadata["risk_level"] == "medium"

    client = McpClientConfig(
        name="codex",
        enabled=True,
        token="secret-token",
        allowed_tools=["market_radar.search_source_items"],
        max_result_limit=50,
        local_only=True,
    )
    with pytest.raises(PermissionError):
        import_sentiment_items(db=None, client=client, items=[item()])
