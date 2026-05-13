from apscheduler.schedulers.background import BackgroundScheduler

from invest_assistant.bootstrap.scheduler import create_scheduler


def build_job_scheduler() -> BackgroundScheduler:
    return create_scheduler()
