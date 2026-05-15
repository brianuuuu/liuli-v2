from invest_assistant.modules.alert_center.jobs import JOBS as ALERT_CENTER_JOBS
from invest_assistant.modules.basic.disclosure_library.jobs import JOBS as DISCLOSURE_JOBS
from invest_assistant.modules.basic.stock_master.jobs import JOBS as STOCK_MASTER_JOBS
from invest_assistant.modules.knowledge_base.jobs import JOBS as KNOWLEDGE_BASE_JOBS
from invest_assistant.modules.market_radar.jobs import JOBS as MARKET_RADAR_JOBS
from invest_assistant.modules.portfolio.jobs import JOBS as PORTFOLIO_JOBS
from invest_assistant.modules.stock_analysis.jobs import JOBS as STOCK_ANALYSIS_JOBS
from invest_assistant.modules.track_discovery.jobs import JOBS as TRACK_DISCOVERY_JOBS

ALL_JOBS = [
    *STOCK_MASTER_JOBS,
    *STOCK_ANALYSIS_JOBS,
    *DISCLOSURE_JOBS,
    *MARKET_RADAR_JOBS,
    *TRACK_DISCOVERY_JOBS,
    *PORTFOLIO_JOBS,
    *ALERT_CENTER_JOBS,
    *KNOWLEDGE_BASE_JOBS,
]

JOB_REGISTRY = {job.job_name: job for job in ALL_JOBS}
