from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from invest_assistant.bootstrap.database import Base, get_db
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.alert_center.models import AlertRule
from invest_assistant.modules.alert_center.models import ensure_alert_center_schema
from invest_assistant.modules.alert_center.service import evaluate_rules
from invest_assistant.modules.alert_center.router import router as alert_router
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunLog
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY
from invest_assistant.modules.market_radar import jobs as market_jobs
from invest_assistant.modules.market_radar.models import AiTagSuggestion, SourceItem
from invest_assistant.modules.knowledge_base.service import ResolvedPrompt


def make_session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    import invest_assistant.modules.basic.ai_audit.models  # noqa: F401
    import invest_assistant.modules.basic.auth.models  # noqa: F401
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


def make_alert_client(db: Session) -> TestClient:
    app = FastAPI()
    app.include_router(alert_router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: UserAccount(id=1, username="tester", password_hash="x")
    return TestClient(app)


def test_public_alert_event_create_endpoint_is_not_allowed():
    db = make_session()
    client = make_alert_client(db)

    response = client.post(
        "/api/alerts/events",
        json={"rule_id": None, "event_level": "info", "title": "正常流程通知", "message": "不应写报警", "status": "unread"},
    )

    assert response.status_code == 405
    assert db.scalar(select(func.count(AlertEvent.id))) == 0


def test_alert_rule_name_is_required_when_creating_rule():
    db = make_session()
    client = make_alert_client(db)

    response = client.post(
        "/api/alerts/rules",
        json={
            "name": "   ",
            "rule_type": "job_failure",
            "target_type": "job_center",
            "target_id": None,
            "condition_json": "{}",
            "enabled": True,
        },
    )

    assert response.status_code == 422


def test_alert_rule_schema_backfills_required_name_and_status():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE alert_rule (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    rule_type VARCHAR(64) NOT NULL,
                    target_type VARCHAR(64) NOT NULL,
                    target_id INTEGER,
                    condition_json TEXT NOT NULL,
                    enabled BOOLEAN NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO alert_rule (rule_type, target_type, target_id, condition_json, enabled, created_at, updated_at)
                VALUES
                    ('job_failure', 'job_center', NULL, '{}', 1, '2026-06-24 09:00:00', '2026-06-24 09:00:00'),
                    ('heat', 'track', 1, '{}', 1, '2026-06-24 09:00:00', '2026-06-24 09:00:00')
                """
            )
        )

    ensure_alert_center_schema(engine)

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, name, status FROM alert_rule ORDER BY id")).mappings().all()
    assert rows == [
        {"id": 1, "name": "任务中心失败报警", "status": "active"},
        {"id": 2, "name": "预警规则 #2", "status": "active"},
    ]


def test_read_all_marks_only_unread_alert_events_as_read():
    db = make_session()
    db.add_all(
        [
            AlertEvent(rule_id=1, title="未读一", message="message", status="unread"),
            AlertEvent(rule_id=2, title="未读二", message="message", status="unread"),
            AlertEvent(rule_id=3, title="已读", message="message", status="read"),
            AlertEvent(rule_id=4, title="已处理", message="message", status="handled"),
        ]
    )
    db.commit()
    client = make_alert_client(db)

    response = client.post("/api/alerts/events/read-all")

    assert response.status_code == 200
    assert response.json() == {"updated_count": 2}
    statuses = db.execute(select(AlertEvent.title, AlertEvent.status).order_by(AlertEvent.id)).all()
    assert statuses == [
        ("未读一", "read"),
        ("未读二", "read"),
        ("已读", "read"),
        ("已处理", "handled"),
    ]


def test_single_alert_event_can_be_read_and_deleted():
    db = make_session()
    db.add(AlertEvent(rule_id=1, title="未读", message="message", status="unread"))
    db.commit()
    client = make_alert_client(db)

    read_response = client.post("/api/alerts/events/1/read")
    delete_response = client.delete("/api/alerts/events/1")

    assert read_response.status_code == 200
    assert read_response.json()["status"] == "read"
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}
    assert db.scalar(select(func.count(AlertEvent.id))) == 0


def test_alert_rule_enable_disable_and_delete_actions_hide_deleted_rule():
    db = make_session()
    client = make_alert_client(db)
    create_response = client.post(
        "/api/alerts/rules",
        json={
            "name": "任务中心失败报警",
            "rule_type": "job_failure",
            "target_type": "job_center",
            "target_id": None,
            "condition_json": "{}",
            "enabled": True,
        },
    )
    rule_id = create_response.json()["id"]

    disable_response = client.post(f"/api/alerts/rules/{rule_id}/disable")
    enable_response = client.post(f"/api/alerts/rules/{rule_id}/enable")
    delete_response = client.delete(f"/api/alerts/rules/{rule_id}")
    list_response = client.get("/api/alerts/rules")

    assert create_response.status_code == 200
    assert disable_response.status_code == 200
    assert disable_response.json()["enabled"] is False
    assert enable_response.status_code == 200
    assert enable_response.json()["enabled"] is True
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "deleted"
    assert list_response.status_code == 200
    assert list_response.json() == []

    db.add(
        JobRunLog(
            job_name="market_radar.fetch_news",
            module_name="market_radar",
            trigger_type="manual",
            status="failed",
            started_at=datetime(2026, 6, 24, 9, 0, 0),
            finished_at=datetime(2026, 6, 24, 9, 0, 1),
            duration_ms=1000,
        )
    )
    db.commit()

    result = evaluate_rules(db)

    assert result.processed_count == 0
    assert result.inserted_count == 0
    assert db.scalar(select(func.count(AlertEvent.id))) == 0


def test_hotword_candidate_job_does_not_create_alert_events(monkeypatch):
    db = make_session()
    db.add(
        SourceItem(
            source_type="news",
            source_name="manual",
            title="商业航天新闻",
            content="商业航天产业链升温",
            publish_time=datetime(2026, 6, 24, 9, 0, 0),
        )
    )
    db.commit()

    monkeypatch.setattr(market_jobs, "SessionLocal", lambda: db)
    monkeypatch.setattr(market_jobs, "_hotword_source_item_cursor", lambda session: 0)
    monkeypatch.setattr(market_jobs, "set_runtime_state", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        market_jobs,
        "get_active_prompt_by_key",
        lambda session, key: ResolvedPrompt(
            id=1,
            prompt_key=key,
            title="test",
            target_task=key,
            provider="deepseek",
            model="deepseek-test",
            system_prompt="system",
            user_prompt="user",
            response_format="json_object",
            status="active",
        ),
    )
    monkeypatch.setattr(
        market_jobs.deepseek_client,
        "extract_hotwords",
        lambda news, prompt, model: {
            "hotwords": [{"name": "商业航天", "score": 8, "reason": "产业链升温"}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        },
    )

    result = market_jobs.extract_daily_hotwords_deepseek_job(target_date="2026-06-24")

    assert result.success is True
    assert result.inserted_count == 1
    assert db.scalar(select(func.count(AiTagSuggestion.id))) == 1
    assert db.scalar(select(func.count(AlertEvent.id))) == 0


def test_job_failure_rule_creates_one_alert_for_each_failed_job_run():
    db = make_session()
    db.add_all(
        [
            JobConfig(
                job_name="market_radar.fetch_news",
                module_name="market_radar",
                display_name="抓取市场新闻",
                description="",
            ),
                AlertRule(
                    name="任务中心失败报警",
                    rule_type="job_failure",
                    target_type="job_center",
                    condition_json='{"event_level":"warning"}',
                    enabled=True,
            ),
            JobRunLog(
                job_name="market_radar.fetch_news",
                module_name="market_radar",
                trigger_type="manual",
                status="failed",
                started_at=datetime(2026, 6, 24, 9, 0, 0),
                finished_at=datetime(2026, 6, 24, 9, 0, 1),
                duration_ms=1000,
                error_message="network down",
            ),
            JobRunLog(
                job_name="market_radar.extract_tags",
                module_name="market_radar",
                trigger_type="schedule",
                status="success",
                started_at=datetime(2026, 6, 24, 10, 0, 0),
                finished_at=datetime(2026, 6, 24, 10, 0, 1),
                duration_ms=1000,
            ),
        ]
    )
    db.commit()

    first = evaluate_rules(db)
    second = evaluate_rules(db)

    events = list(db.scalars(select(AlertEvent).order_by(AlertEvent.id)))
    assert first.inserted_count == 1
    assert second.inserted_count == 0
    assert len(events) == 1
    assert events[0].rule_id == 1
    assert events[0].event_level == "warning"
    assert "抓取市场新闻" in events[0].title
    assert "network down" in events[0].message


def test_job_failure_rule_does_not_recreate_handled_alert_for_same_run_log():
    db = make_session()
    rule = AlertRule(
        name="任务中心失败报警",
        rule_type="job_failure",
        target_type="job_center",
        condition_json='{"event_level":"warning"}',
        enabled=True,
    )
    failed_log = JobRunLog(
        job_name="market_radar.fetch_news",
        module_name="market_radar",
        trigger_type="manual",
        status="failed",
        started_at=datetime(2026, 6, 24, 9, 0, 0),
        finished_at=datetime(2026, 6, 24, 9, 0, 1),
        duration_ms=1000,
        error_message="network down",
    )
    db.add_all([rule, failed_log])
    db.commit()
    db.add(
        AlertEvent(
            rule_id=rule.id,
            title=f"任务失败：market_radar.fetch_news #{failed_log.id}",
            message="handled old alert",
            status="handled",
        )
    )
    db.commit()

    result = evaluate_rules(db)

    assert result.inserted_count == 0
    assert db.scalar(select(func.count(AlertEvent.id))) == 1


def test_job_failure_rule_ignores_failed_logs_at_or_before_min_log_id():
    db = make_session()
    old_log = JobRunLog(
        job_name="old.job",
        module_name="test",
        trigger_type="manual",
        status="failed",
        started_at=datetime(2026, 6, 24, 8, 0, 0),
        finished_at=datetime(2026, 6, 24, 8, 0, 1),
        duration_ms=1000,
    )
    db.add(old_log)
    db.commit()
    db.add(
        AlertRule(
            name="任务中心失败报警",
            rule_type="job_failure",
            target_type="job_center",
            condition_json=f'{{"event_level":"warning","min_log_id":{old_log.id}}}',
            enabled=True,
        )
    )
    db.add(
        JobRunLog(
            job_name="new.job",
            module_name="test",
            trigger_type="manual",
            status="failed",
            started_at=datetime(2026, 6, 24, 9, 0, 0),
            finished_at=datetime(2026, 6, 24, 9, 0, 1),
            duration_ms=1000,
        )
    )
    db.commit()

    result = evaluate_rules(db)

    events = list(db.scalars(select(AlertEvent).order_by(AlertEvent.id)))
    assert result.inserted_count == 1
    assert len(events) == 1
    assert "new.job" in events[0].title


def test_alert_rule_evaluation_job_is_scheduled_and_manually_runnable():
    definition = JOB_REGISTRY["alert_center.evaluate_rules"]

    assert definition.trigger_type == "both"
    assert definition.cron_expr == "*/5 * * * *"
    assert definition.enabled is True
