from datetime import datetime, timedelta

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.stock_master import models as _stock_models  # noqa: F401
from invest_assistant.modules.market_radar import service
from invest_assistant.modules.market_radar.models import SourceItem, SourceTag, Tag
from invest_assistant.modules.market_radar.schemas import SourceItemCreate
from invest_assistant.modules.track_discovery import models as _track_models  # noqa: F401


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return engine, sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def test_market_radar_models_define_feed_performance_indexes():
    indexes_by_table = {
        table.name: {index.name: tuple(column.name for column in index.columns) for index in table.indexes}
        for table in Base.metadata.tables.values()
        if table.name in {"source_item", "tag_heat_snapshot", "tag_edge_snapshot"}
    }

    assert indexes_by_table["source_item"]["ix_source_item_feed_order"] == ("publish_time", "id")
    assert indexes_by_table["source_item"]["ix_source_item_url_dedupe_lookup"] == (
        "source_type",
        "source_name",
        "source_url",
    )
    assert indexes_by_table["source_item"]["ix_source_item_title_time_dedupe_lookup"] == (
        "source_type",
        "source_name",
        "publish_time",
        "title",
    )
    assert indexes_by_table["source_item"]["ix_source_item_daily_stats"] == (
        "publish_time",
        "created_at",
        "source_type",
    )
    assert indexes_by_table["tag_heat_snapshot"]["ix_tag_heat_snapshot_ranking_lookup"] == (
        "window_type",
        "stat_time",
        "rank_no",
    )
    assert indexes_by_table["tag_heat_snapshot"]["ix_tag_heat_snapshot_trend_lookup"] == (
        "tag_id",
        "window_type",
        "stat_time",
    )
    assert indexes_by_table["tag_edge_snapshot"]["ix_tag_edge_snapshot_graph_lookup"] == (
        "window_type",
        "related_tag_type",
        "stat_time",
        "weight",
    )


def test_list_source_items_orders_null_publish_time_last():
    _engine, SessionLocal = make_session()
    db = SessionLocal()
    try:
        service.create_source_item(
            db,
            SourceItemCreate(source_type="news", source_name="manual", title="no publish time", content="content"),
        )
        service.create_source_item(
            db,
            SourceItemCreate(
                source_type="news",
                source_name="manual",
                title="older",
                content="content",
                publish_time=datetime(2026, 5, 26, 9, 0, 0),
            ),
        )
        service.create_source_item(
            db,
            SourceItemCreate(
                source_type="news",
                source_name="manual",
                title="newer",
                content="content",
                publish_time=datetime(2026, 5, 26, 10, 0, 0),
            ),
        )

        rows = service.list_source_items(db, limit=10)

        assert [row["title"] for row in rows] == ["newer", "older", "no publish time"]
    finally:
        db.close()


def test_list_source_items_loads_tags_in_one_batch_query_for_page():
    engine, SessionLocal = make_session()
    db = SessionLocal()
    query_statements: list[str] = []
    base_time = datetime(2026, 5, 26, 9, 0, 0)
    try:
        tag = Tag(name="AI", type="hotword", status="active")
        db.add(tag)
        db.flush()
        for index in range(5):
            item = SourceItem(
                source_type="news",
                source_name="manual",
                title=f"AI item {index}",
                content=f"content {index}",
                publish_time=base_time + timedelta(minutes=index),
            )
            db.add(item)
            db.flush()
            db.add(SourceTag(source_item_id=item.id, tag_id=tag.id, trigger_text="AI", confidence=1.0, extractor="rule"))
        db.commit()

        @event.listens_for(engine, "before_cursor_execute")
        def record_query(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
            query_statements.append(statement)

        rows = service.list_source_items(db, limit=5)

        source_tag_queries = [
            statement
            for statement in query_statements
            if "source_tag" in statement.lower() and " join " in statement.lower()
        ]
        assert [row["source_tags"][0]["tag"]["name"] for row in rows] == ["AI", "AI", "AI", "AI", "AI"]
        assert len(source_tag_queries) == 1
    finally:
        event.remove(engine, "before_cursor_execute", record_query)
        db.close()
