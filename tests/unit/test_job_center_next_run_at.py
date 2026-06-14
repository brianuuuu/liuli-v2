from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.job_center.models import JobConfig
from invest_assistant.modules.basic.job_center.service import sync_job_definitions
from invest_assistant.modules.basic.job_center.worker import sync_scheduled_jobs


def make_session():
    import invest_assistant.modules.basic.ai_audit.models  # noqa: F401
    import invest_assistant.modules.basic.auth.models  # noqa: F401
    import invest_assistant.modules.basic.disclosure_library.models  # noqa: F401
    import invest_assistant.modules.basic.job_center.models  # noqa: F401
    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.basic.system_config.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.market_radar.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class DummyScheduler:
    timezone = "Asia/Shanghai"

    def __init__(self):
        self.jobs = {}

    def get_job(self, job_id):
        return self.jobs.get(job_id)

    def add_job(self, func, trigger, id, name, kwargs, replace_existing, max_instances, coalesce, misfire_grace_time):
        next_run = trigger.get_next_fire_time(None, datetime(2026, 6, 13, 2, 0, 0))
        self.jobs[id] = type("DummyJob", (), {"id": id, "name": name, "next_run_time": next_run})()

    def remove_job(self, job_id):
        self.jobs.pop(job_id, None)

    def get_jobs(self):
        return list(self.jobs.values())


def test_sync_scheduled_jobs_persists_and_clears_next_run_at():
    SessionLocal = make_session()
    db = SessionLocal()
    scheduler = DummyScheduler()
    try:
        sync_job_definitions(db)
        config = db.query(JobConfig).filter(JobConfig.job_name == "market_radar.fetch_news").one()
        config.config_json = {
            "enabled": True,
            "execution_mode": "schedule",
            "schedule_kind": "daily",
            "run_time": "03:00",
            "cron_expr": "0 3 * * *",
            "allow_manual_run": True,
            "timeout_seconds": 120,
            "max_retries": 1,
        }
        db.commit()

        sync_scheduled_jobs(scheduler, db)
        db.refresh(config)

        assert config.next_run_at is not None
        assert config.next_run_at.hour == 3
        assert config.next_run_at.minute == 0

        config.config_json = {**config.config_json, "enabled": False}
        db.commit()
        sync_scheduled_jobs(scheduler, db)
        db.refresh(config)

        assert config.next_run_at is None
    finally:
        db.close()
