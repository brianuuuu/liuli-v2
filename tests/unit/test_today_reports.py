from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.report_library import service as report_service
from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.shared.time_utils import beijing_now


def make_session():
    import invest_assistant.modules.basic.ai_audit.models  # noqa: F401
    import invest_assistant.modules.basic.auth.models  # noqa: F401
    import invest_assistant.modules.basic.job_center.models  # noqa: F401
    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.basic.system_config.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.market_radar.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)()


def add_report(db, title: str, created_at, publish_time=None, source_module="market_radar") -> Report:
    item = Report(
        title=title,
        report_type="daily",
        source_module=source_module,
        file_format="md",
        file_path=f"reports/{title}.md",
        generated_by="job",
        status="published",
        publish_time=publish_time,
        created_at=created_at,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def test_today_reports_cut_at_beijing_midnight_by_created_at():
    """按入库时间切，而且日界是北京时间当日 0 点。

    凌晨 3 点那个定时任务生成的是前一自然日的日报：publish_time 在昨天，created_at
    在今天。它是今天才出现在面前的东西，必须算今天——用 UTC 切的话这一篇会掉到昨天，
    而它恰恰是最该显示的一篇。
    """
    db = make_session()
    today_start = beijing_now().replace(hour=0, minute=0, second=0, microsecond=0)

    overnight = add_report(
        db,
        "昨日市场雷达日报",
        created_at=today_start + timedelta(hours=3),
        publish_time=today_start - timedelta(hours=10),
    )
    just_now = add_report(db, "刚导入的研究回流", created_at=beijing_now(), source_module="knowledge_base")
    add_report(db, "昨天入库的报告", created_at=today_start - timedelta(minutes=1))
    add_report(db, "上周入库的报告", created_at=today_start - timedelta(days=7))

    result = report_service.list_today_reports(db)

    assert [item["id"] for item in result["items"]] == [just_now.id, overnight.id]
    assert result["total"] == 2
    assert result["since"] == today_start
    # 卡片要显示入库时间，所以这个字段必须回出去。
    # SQLite 读回来会丢 tzinfo（Postgres 不会），这里只比时刻本身。
    overnight_created = result["items"][1]["created_at"]
    assert overnight_created.replace(tzinfo=None) == (today_start + timedelta(hours=3)).replace(tzinfo=None)


def test_today_reports_report_total_beyond_the_shown_limit():
    """标题叫"今日报告"却只显示前几条，总数必须单独回，否则卡片在撒谎。"""
    db = make_session()
    now = beijing_now()
    for index in range(6):
        add_report(db, f"今日报告 {index}", created_at=now - timedelta(minutes=index))

    result = report_service.list_today_reports(db, limit=4)

    assert len(result["items"]) == 4
    assert result["total"] == 6


def test_today_reports_returns_empty_without_today_entries():
    db = make_session()
    add_report(db, "上个月的报告", created_at=beijing_now() - timedelta(days=30))

    result = report_service.list_today_reports(db)

    assert result["items"] == []
    assert result["total"] == 0
