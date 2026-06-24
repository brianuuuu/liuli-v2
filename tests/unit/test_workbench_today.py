from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunRequest
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.console.router import workbench_today
from invest_assistant.modules.market_radar.models import AiTagSuggestion, Hotword, SourceItem, Tag
from invest_assistant.modules.stock_analysis.models import StockMaterial, StockPoolItem
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial
from invest_assistant.shared.time_utils import beijing_now


def make_session() -> Session:
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


def test_workbench_today_returns_compact_aggregates_and_recent_requests():
    db = make_session()
    today = datetime.combine(beijing_now().date(), datetime.min.time())
    stock = Stock(stock_code="000001", stock_name="测试标的")
    track = Track(name="机器人", status="active")
    db.add_all([stock, track])
    db.flush()
    db.add_all(
        [
            SourceItem(source_type="news", source_name="manual", title="新闻", content="content", publish_time=today),
            SourceItem(source_type="announcement", source_name="manual", title="公告", content="content", publish_time=today),
            Tag(name="机器人", type="track", status="active"),
            Hotword(name="热词", status="active", created_at=today),
            AiTagSuggestion(suggested_text="候选词", status="pending"),
            AiRequestLog(
                request_id="ai-today",
                provider="deepseek",
                model="deepseek-v4-flash",
                task_name="test",
                status="success",
                duration_ms=20,
                total_tokens=42,
                created_at=today,
            ),
            StockPoolItem(stock_id=stock.id, status="candidate"),
            StockMaterial(stock_id=stock.id, material_type="source_item", material_id=1, status="pending"),
            TrackMaterial(track_id=track.id, material_type="source_item", material_id=1, status="pending"),
            AlertEvent(rule_id=1, title="预警", message="message", status="unread", event_time=today),
            JobConfig(job_name="failed.job", module_name="test", display_name="失败任务", description="", last_status="failed"),
        ]
    )
    for index in range(10):
        db.add(
            JobRunRequest(
                job_name=f"job-{index}",
                status="success",
                requested_at=today + timedelta(minutes=index),
                finished_at=today + timedelta(minutes=index, seconds=10),
            )
        )
    db.commit()

    result = workbench_today(db)

    assert result["source_stats"]["total"] == 2
    assert result["source_stats"]["news"] == 1
    assert result["source_stats"]["announcement"] == 1
    assert result["active"] == {"tags": 1, "hotwords": 1, "stocks": 1, "tracks": 1}
    assert result["new"]["hotwords"] == 1
    assert result["ai"] == {"today": 1, "today_tokens": 42}
    assert result["todo"] == {
        "pending_suggestions": 1,
        "pending_track_materials": 1,
        "pending_stock_materials": 1,
        "unread_alerts": 1,
        "failed_jobs": 1,
        "total": 5,
    }
    operation_jobs = {item["job_name"]: item for item in result["operation_jobs"]}
    assert operation_jobs["track_discovery.review_track_events_deepseek"]["exists"] is True
    assert operation_jobs["track_discovery.review_track_events_deepseek"]["last_run_at"] is None
    assert len(result["recent_run_requests"]) == 8
    assert result["recent_run_requests"][0]["job_name"] == "job-9"
    assert "params_json" not in result["recent_run_requests"][0]
