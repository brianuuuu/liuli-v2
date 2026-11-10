from datetime import datetime, timedelta
from unittest.mock import Mock
from zoneinfo import ZoneInfo

import pytest
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center import service
from invest_assistant.modules.basic.job_center.models import JobConfig
from invest_assistant.modules.basic.job_center.registry import JOB_REGISTRY


WEEKDAY_JOBS = [
    ("stock_analysis.sync_daily_bars", 18, 30),
    ("stock_analysis.sync_market_index_daily_bars", 18, 25),
    ("portfolio.evaluate_adjust_advice", 19, 15),
]
BEIJING = ZoneInfo("Asia/Shanghai")


@pytest.mark.parametrize("job_name,hour,minute", WEEKDAY_JOBS)
def test_weekday_jobs_run_monday_through_friday(job_name, hour, minute):
    trigger = CronTrigger.from_crontab(JOB_REGISTRY[job_name].cron_expr, timezone=BEIJING)
    now = datetime(2026, 11, 2, tzinfo=BEIJING)
    previous = None
    fires = []
    for _ in range(7):
        fire = trigger.get_next_fire_time(previous, now)
        fires.append(fire)
        previous, now = fire, fire + timedelta(seconds=1)

    assert fires == [datetime(2026, 11, day, hour, minute, tzinfo=BEIJING) for day in (2, 3, 4, 5, 6, 9, 10)]


@pytest.mark.parametrize("job_name,hour,minute", WEEKDAY_JOBS)
@pytest.mark.parametrize("enabled", [True, False])
def test_sync_definitions_repairs_saved_legacy_cron_and_preserves_settings(monkeypatch, job_name, hour, minute, enabled):
    definition = JOB_REGISTRY[job_name]
    monkeypatch.setattr(service, "JOB_REGISTRY", {job_name: definition})
    saved = {
        "enabled": enabled,
        "execution_mode": "schedule",
        "schedule_kind": "custom",
        "run_time": f"{hour:02}:{minute:02}",
        "cron_expr": f"{minute} {hour} * * 1-5",
        "allow_manual_run": False,
        "timeout_seconds": 1234,
        "max_retries": 4,
        "params": {"max_stocks": 42},
    }
    config = JobConfig(job_name=job_name, module_name=definition.module_name)
    config.config_json = saved
    config.ext_json = {"notes": "keep"}
    db = Mock(spec=Session)
    db.scalar.return_value = config

    assert service.sync_job_definitions(db) == 1
    assert config.config_json == {**saved, "cron_expr": definition.cron_expr}
    assert config.ext_json == {"notes": "keep"}
    repaired = config._config_json
    service.sync_job_definitions(db)
    assert config._config_json == repaired
    assert db.commit.call_count == 2
    db.add.assert_not_called()


@pytest.mark.parametrize(
    "job_name,overrides",
    [
        ("stock_analysis.sync_daily_bars", {"cron_expr": "45 19 * * 1-5"}),
        ("stock_analysis.sync_daily_bars", {"cron_expr": "30 18 * * mon-thu"}),
        ("stock_analysis.sync_daily_bars", {"cron_expr": "30 18 * * mon-fri"}),
        ("stock_analysis.sync_daily_bars", {"schedule_kind": "daily", "cron_expr": "30 18 * * *"}),
        ("stock_analysis.sync_daily_bars", {"execution_mode": "manual", "cron_expr": None}),
        ("portfolio.capture_daily_value_snapshot", {}),
    ],
)
def test_sync_definitions_preserves_custom_schedules_and_unrelated_jobs(monkeypatch, job_name, overrides):
    definition = JOB_REGISTRY[job_name]
    monkeypatch.setattr(service, "JOB_REGISTRY", {job_name: definition})
    saved = {
        "enabled": True,
        "execution_mode": "schedule",
        "schedule_kind": "custom",
        "cron_expr": "30 18 * * 1-5",
        **overrides,
    }
    config = JobConfig(job_name=job_name, module_name=definition.module_name)
    config.config_json = saved
    db = Mock(spec=Session)
    db.scalar.return_value = config

    service.sync_job_definitions(db)

    assert config.config_json == saved


@pytest.mark.parametrize("job_name,hour,minute", WEEKDAY_JOBS)
def test_sync_definitions_creates_jobs_with_weekday_schedule(monkeypatch, job_name, hour, minute):
    monkeypatch.setattr(service, "JOB_REGISTRY", {job_name: JOB_REGISTRY[job_name]})
    db = Mock(spec=Session)
    db.scalar.return_value = None

    service.sync_job_definitions(db)

    config = db.add.call_args.args[0]
    assert config.config_json["cron_expr"] == f"{minute} {hour} * * mon-fri"
