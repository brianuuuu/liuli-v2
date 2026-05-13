from fastapi import FastAPI

from invest_assistant.bootstrap.database import create_all_tables
from invest_assistant.modules.basic.auth.router import router as auth_router


def create_app() -> FastAPI:
    create_all_tables()
    app = FastAPI(title="liuli", version="0.1.0")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    return app
