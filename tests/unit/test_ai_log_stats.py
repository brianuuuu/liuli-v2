from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.modules.basic.ai_audit.service import count_ai_request_logs, list_ai_request_logs
from invest_assistant.shared.time_utils import beijing_now


def make_session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

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
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def test_ai_log_list_defaults_to_visible_first_rows_and_stats_are_aggregated():
    db = make_session()
    today = datetime.combine(beijing_now().date(), datetime.min.time())
    yesterday = today - timedelta(days=1)
    for index in range(25):
        db.add(
            AiRequestLog(
                request_id=f"today-{index}",
                provider="deepseek",
                model="deepseek-v4-flash",
                task_name="test",
                status="success",
                duration_ms=10,
                total_tokens=2,
                created_at=today + timedelta(minutes=index),
            )
        )
    db.add(
        AiRequestLog(
            request_id="yesterday",
            provider="deepseek",
            model="deepseek-v4-flash",
            task_name="test",
            status="success",
            duration_ms=10,
            total_tokens=100,
            created_at=yesterday,
        )
    )
    db.commit()

    logs = list_ai_request_logs(db)
    stats = count_ai_request_logs(db)

    assert len(logs) == 20
    assert stats == {"total": 26, "today": 25, "today_tokens": 50}
