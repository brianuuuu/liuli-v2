from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.job_center.models import JobRunRequest
from invest_assistant.modules.market_radar.backfill_requests import BACKFILL_JOB_NAME, enqueue_tag_backfill
from invest_assistant.modules.market_radar.models import AiTagSuggestion, SourceItem, SourceTag, Tag
from invest_assistant.modules.market_radar.schemas import AiTagSuggestionApprove, HotwordCreate
from invest_assistant.modules.market_radar.service import (
    approve_ai_tag_suggestion,
    backfill_source_tags,
    create_hotword,
)
from invest_assistant.shared.db_types import loads_json


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
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def add_tag(db, name: str, tag_type: str = "hotword") -> Tag:
    tag = Tag(name=name, type=tag_type, source="ai", status="active")
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def run_request_params(db) -> list[dict]:
    requests = list(db.scalars(select(JobRunRequest).order_by(JobRunRequest.id.asc())))
    return [loads_json(item.params_json) for item in requests]


def test_enqueue_tag_backfill_merges_pending_requests_by_backfill_scope():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        tags = [add_tag(db, f"hotword-{index}") for index in range(100)]

        for tag in tags:
            enqueue_tag_backfill(db, tag)
        enqueue_tag_backfill(db, tags[0])
        db.commit()

        requests = list(db.scalars(select(JobRunRequest)))
        params = loads_json(requests[0].params_json)
        assert len(requests) == 1
        assert requests[0].job_name == BACKFILL_JOB_NAME
        assert params["tag_type"] == "hotword"
        assert params["overwrite"] is False
        assert sorted(params["tag_ids"]) == sorted(tag.id for tag in tags)
        assert "tag_id" not in params
    finally:
        db.close()


def test_enqueue_tag_backfill_keeps_different_default_windows_separate():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        stock_tag = add_tag(db, "宁德时代", "stock")
        track_tag = add_tag(db, "AI算力", "track")
        hotword_tag = add_tag(db, "商业航天", "hotword")

        enqueue_tag_backfill(db, stock_tag)
        enqueue_tag_backfill(db, track_tag)
        enqueue_tag_backfill(db, hotword_tag)
        db.commit()

        params = run_request_params(db)
        assert len(params) == 3
        assert {item["tag_type"] for item in params} == {"stock", "track", "hotword"}
        assert all(item["tag_ids"] for item in params)
    finally:
        db.close()


def test_backfill_source_tags_limits_matching_to_tag_ids_and_keeps_tag_id_compatibility():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        gpu = add_tag(db, "GPU")
        robot = add_tag(db, "机器人")
        db.add(SourceItem(source_type="news", source_name="manual", title="GPU订单增长", content="GPU需求上升"))
        db.add(SourceItem(source_type="news", source_name="manual", title="机器人订单增长", content="机器人需求上升"))
        db.commit()

        tag_ids_result = backfill_source_tags(db, tag_ids=[gpu.id])
        matched_after_tag_ids = list(db.scalars(select(SourceTag.tag_id).order_by(SourceTag.tag_id.asc())))
        tag_id_result = backfill_source_tags(db, tag_id=robot.id)
        matched_after_tag_id = list(db.scalars(select(SourceTag.tag_id).order_by(SourceTag.tag_id.asc())))

        assert tag_ids_result.inserted_count == 1
        assert matched_after_tag_ids == [gpu.id]
        assert tag_id_result.inserted_count == 1
        assert matched_after_tag_id == [gpu.id, robot.id]
    finally:
        db.close()


def test_approve_ai_suggestion_new_hotword_enqueues_one_backfill_request():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        suggestion = AiTagSuggestion(suggested_text="商业航天", status="pending")
        db.add(suggestion)
        db.commit()
        db.refresh(suggestion)

        approve_ai_tag_suggestion(
            db,
            suggestion,
            AiTagSuggestionApprove(final_tag_name="商业航天", target_type="hotword", target_name="商业航天"),
        )

        requests = list(db.scalars(select(JobRunRequest)))
        params = loads_json(requests[0].params_json)
        assert len(requests) == 1
        assert params["tag_type"] == "hotword"
        assert len(params["tag_ids"]) == 1
    finally:
        db.close()


def test_approve_ai_suggestion_new_track_enqueues_one_backfill_request():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        suggestion = AiTagSuggestion(suggested_text="AI算力", status="pending")
        db.add(suggestion)
        db.commit()
        db.refresh(suggestion)

        approve_ai_tag_suggestion(
            db,
            suggestion,
            AiTagSuggestionApprove(final_tag_name="AI算力", target_type="track", target_name="AI算力"),
        )

        requests = list(db.scalars(select(JobRunRequest)))
        params = loads_json(requests[0].params_json)
        assert len(requests) == 1
        assert params["tag_type"] == "track"
        assert len(params["tag_ids"]) == 1
    finally:
        db.close()


def test_approve_ai_suggestion_existing_hotword_merges_backfill_request():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        hotword = create_hotword(db, HotwordCreate(name="商业航天", status="active"))
        suggestion = AiTagSuggestion(suggested_text="商业航天", status="pending")
        db.add(suggestion)
        db.commit()
        db.refresh(suggestion)

        approve_ai_tag_suggestion(
            db,
            suggestion,
            AiTagSuggestionApprove(final_tag_name="商业航天", target_type="hotword", target_id=int(hotword["id"])),
        )

        requests = list(db.scalars(select(JobRunRequest)))
        params = loads_json(requests[0].params_json)
        assert len(requests) == 1
        assert params["tag_type"] == "hotword"
        assert len(params["tag_ids"]) == 1
    finally:
        db.close()
