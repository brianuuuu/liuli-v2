from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from invest_assistant.bootstrap.config import get_settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_parent(database_url: str) -> None:
    if not database_url.startswith("sqlite:///"):
        return
    raw_path = database_url.replace("sqlite:///", "", 1)
    db_path = Path(raw_path)
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)


def normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+"):
        return database_url
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


def build_engine_options(database_url: str) -> dict:
    options: dict = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
    return options


settings = get_settings()
database_url = normalize_database_url(settings.database_url)
_ensure_sqlite_parent(database_url)
engine = create_engine(
    database_url,
    **build_engine_options(database_url),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all_tables() -> None:
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

    from invest_assistant.modules.basic.job_center.models import ensure_job_center_schema
    from invest_assistant.modules.basic.stock_master.models import ensure_stock_master_schema
    from invest_assistant.modules.alert_center.models import ensure_alert_center_schema
    from invest_assistant.modules.knowledge_base.models import ensure_knowledge_base_schema
    from invest_assistant.modules.market_radar.models import ensure_market_radar_schema
    from invest_assistant.modules.track_discovery.models import ensure_track_discovery_schema

    ensure_job_center_schema(engine)
    ensure_stock_master_schema(engine)
    ensure_alert_center_schema(engine)
    ensure_knowledge_base_schema(engine)
    ensure_market_radar_schema(engine)
    ensure_track_discovery_schema(engine)

    from invest_assistant.modules.knowledge_base.service import ensure_default_prompts

    db = SessionLocal()
    try:
        ensure_default_prompts(db)
    finally:
        db.close()
