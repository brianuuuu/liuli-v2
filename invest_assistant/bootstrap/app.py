from fastapi import FastAPI

from invest_assistant.bootstrap.database import create_all_tables
from invest_assistant.modules.basic.auth.router import router as auth_router
from invest_assistant.modules.basic.disclosure_library.router import router as disclosure_library_router
from invest_assistant.modules.basic.job_center.router import router as job_center_router
from invest_assistant.modules.basic.report_library.router import router as report_library_router
from invest_assistant.modules.basic.stock_master.router import router as stock_master_router
from invest_assistant.modules.basic.system_config.router import router as system_config_router
from invest_assistant.modules.alert_center.router import router as alert_center_router
from invest_assistant.modules.console.router import router as console_router
from invest_assistant.modules.knowledge_base.router import router as knowledge_base_router
from invest_assistant.modules.market_radar.router import router as market_radar_router
from invest_assistant.modules.portfolio.router import router as portfolio_router
from invest_assistant.modules.stock_analysis.router import router as stock_analysis_router
from invest_assistant.modules.track_discovery.router import router as track_discovery_router


def create_app() -> FastAPI:
    create_all_tables()
    app = FastAPI(title="liuli", version="0.1.0")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(stock_master_router)
    app.include_router(system_config_router)
    app.include_router(job_center_router)
    app.include_router(report_library_router)
    app.include_router(disclosure_library_router)
    app.include_router(console_router)
    app.include_router(market_radar_router)
    app.include_router(track_discovery_router)
    app.include_router(stock_analysis_router)
    app.include_router(alert_center_router)
    app.include_router(portfolio_router)
    app.include_router(knowledge_base_router)
    return app
