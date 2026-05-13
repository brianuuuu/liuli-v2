from invest_assistant.modules.alert_center.jobs import JOBS as ALERT_CENTER_JOBS
from invest_assistant.modules.basic.disclosure_library.jobs import JOBS as DISCLOSURE_JOBS
from invest_assistant.modules.basic.stock_master.jobs import JOBS as STOCK_MASTER_JOBS
from invest_assistant.modules.knowledge_base.jobs import JOBS as KNOWLEDGE_BASE_JOBS
from invest_assistant.modules.market_radar.jobs import JOBS as MARKET_RADAR_JOBS

ALL_JOBS = [
    *STOCK_MASTER_JOBS,
    *DISCLOSURE_JOBS,
    *MARKET_RADAR_JOBS,
    *ALERT_CENTER_JOBS,
    *KNOWLEDGE_BASE_JOBS,
]

JOB_REGISTRY = {job.job_name: job for job in ALL_JOBS}
