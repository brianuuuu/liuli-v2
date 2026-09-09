from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.modules.basic.ai_audit.service import (
    ai_request_log_daily_usage,
    count_ai_request_logs,
    list_ai_request_logs,
)
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


def test_ai_request_log_daily_usage_buckets_by_day_and_fills_gaps():
    from datetime import date

    db = make_session()
    end_day = date(2026, 7, 10)

    def add(request_id: str, day: date, hour: int, prompt: int, completion: int) -> None:
        db.add(
            AiRequestLog(
                request_id=request_id,
                provider="deepseek",
                model="deepseek-v4-flash",
                task_name="test",
                status="success",
                duration_ms=10,
                prompt_tokens=prompt,
                completion_tokens=completion,
                total_tokens=prompt + completion,
                created_at=datetime.combine(day, datetime.min.time()) + timedelta(hours=hour),
            )
        )

    # 同一天两条，验证按天求和
    add("a", date(2026, 7, 9), 1, 100, 30)
    add("b", date(2026, 7, 9), 23, 200, 70)
    # 窗口第一天，边界内
    add("c", date(2026, 6, 27), 0, 10, 5)
    # 窗口前一天，必须被排除
    add("d", date(2026, 6, 26), 23, 999, 999)
    # 窗口最后一天的最晚时刻，边界内
    add("e", end_day, 23, 1, 2)
    db.commit()

    rows = ai_request_log_daily_usage(db, days=14, end_date=end_day)

    assert len(rows) == 14
    assert rows[0]["date"] == "2026-06-27"
    assert rows[-1]["date"] == "2026-07-10"

    by_day = {row["date"]: row for row in rows}
    assert by_day["2026-07-09"]["requests"] == 2
    assert by_day["2026-07-09"]["prompt_tokens"] == 300
    assert by_day["2026-07-09"]["completion_tokens"] == 100
    assert by_day["2026-07-09"]["total_tokens"] == 400
    assert by_day["2026-06-27"]["requests"] == 1
    assert by_day["2026-07-10"]["total_tokens"] == 3
    # 窗口外那条不能混进来
    assert sum(row["requests"] for row in rows) == 4
    # 没有记录的日期补零而不是缺项
    assert by_day["2026-06-28"] == {
        "date": "2026-06-28",
        "requests": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    }
