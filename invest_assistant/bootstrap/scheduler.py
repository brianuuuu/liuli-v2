from apscheduler.schedulers.background import BackgroundScheduler


def create_scheduler() -> BackgroundScheduler:
    return BackgroundScheduler(timezone="Asia/Shanghai")
