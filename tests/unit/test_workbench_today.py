from datetime import datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.alert_center.models import AlertEvent
from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.modules.basic.job_center.models import JobConfig, JobRunLog, JobRunRequest
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.console.router import refresh_market_today, workbench_operations, workbench_today
from invest_assistant.modules.knowledge_base.models import KnowledgeNote
from invest_assistant.modules.market_radar.models import AiTagSuggestion, Hotword, SourceItem, Tag
from invest_assistant.modules.portfolio import service as portfolio_service
from invest_assistant.modules.portfolio.models import PortfolioValueSnapshot
from invest_assistant.modules.portfolio.schemas import PortfolioCreate, PortfolioPositionCreate
from invest_assistant.modules.stock_analysis.models import MarketIndexRealtimeQuote
from invest_assistant.modules.stock_analysis.models import StockMaterial, StockPoolItem
from invest_assistant.modules.track_discovery.models import Track, TrackMaterial
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


def test_workbench_today_returns_compact_aggregates():
    db = make_session()
    today = datetime.combine(beijing_now().date(), datetime.min.time())
    stock = Stock(stock_code="000001", stock_name="测试标的")
    track = Track(name="机器人", status="active")
    db.add_all([stock, track])
    db.flush()
    db.add_all(
        [
            SourceItem(source_type="news", source_name="manual", title="新闻", content="content", publish_time=today),
            SourceItem(source_type="announcement", source_name="manual", title="公告", content="content", publish_time=today),
            Tag(name="机器人", type="track", status="active"),
            Hotword(name="热词", status="active", created_at=today),
            AiTagSuggestion(suggested_text="候选词", status="pending"),
            AiRequestLog(
                request_id="ai-today",
                provider="deepseek",
                model="deepseek-v4-flash",
                task_name="test",
                status="success",
                duration_ms=20,
                total_tokens=42,
                created_at=today,
            ),
            StockPoolItem(stock_id=stock.id, status="candidate"),
            StockMaterial(stock_id=stock.id, material_type="source_item", material_id=1, status="pending"),
            TrackMaterial(track_id=track.id, material_type="source_item", material_id=1, status="pending"),
            AlertEvent(rule_id=1, title="预警", message="message", status="unread", event_time=today),
            JobConfig(job_name="failed.job", module_name="test", display_name="失败任务", description="", last_status="failed"),
        ]
    )
    for index in range(10):
        db.add(
            JobRunRequest(
                job_name=f"job-{index}",
                status="success",
                requested_at=today + timedelta(minutes=index),
                finished_at=today + timedelta(minutes=index, seconds=10),
            )
        )
    db.commit()

    result = workbench_today(db)

    assert result["source_stats"]["total"] == 2
    assert result["source_stats"]["news"] == 1
    assert result["source_stats"]["announcement"] == 1
    assert result["active"] == {"tags": 1, "hotwords": 1, "stocks": 1, "tracks": 1}
    assert result["new"]["hotwords"] == 1
    assert result["ai"] == {"today": 1, "today_tokens": 42}
    # 待办总数只算推荐词 / 报告 / 笔记 / 预警，与待办页、安卓待办同口径；材料与失败任务不计入
    assert result["todo"] == {
        "pending_suggestions": 1,
        "pending_reports": 0,
        "inbox_notes": 0,
        "unread_alerts": 1,
        "total": 2,
    }
    # 任务状态与最近执行归工作台待办页（workbench-operations），今日看板不再返回
    assert "operation_jobs" not in result
    assert "recent_run_requests" not in result


def test_workbench_today_returns_cached_market_and_portfolio_today_data():
    db = make_session()
    now = datetime(2026, 6, 25, 10, 31, 26)
    stock = Stock(stock_code="000001", stock_name="平安银行", exchange="SZSE", symbol="000001.SZ")
    db.add(stock)
    db.flush()
    portfolio = portfolio_service.create_portfolio(db, PortfolioCreate(name="主实盘"), user_id=1)
    position = portfolio_service.create_or_update_position(
        db,
        portfolio.id,
        PortfolioPositionCreate(stock_id=stock.id, quantity=100),
    )
    position.current_price = 11
    position.previous_close = 10
    position.market_value = 1100
    position.quote_time = now
    position.price_source = "tushare.realtime_quote"
    db.add(
        PortfolioValueSnapshot(
            portfolio_id=portfolio.id,
            snapshot_date=portfolio_service._today_shanghai() - timedelta(days=1),
            total_value=1000,
            position_market_value=1000,
            cash_amount=0,
            position_count=1,
            source="test",
        )
    )
    db.add(
        MarketIndexRealtimeQuote(
            code="000001.SH",
            name="上证指数",
            price=3012.44,
            change=12.58,
            pct_chg=0.42,
            quote_time=now,
            source="tushare.realtime_quote",
            status="success",
        )
    )
    db.commit()

    result = workbench_today(db)

    index_by_code = {item["code"]: item for item in result["market_indices"]["items"]}
    assert index_by_code["000001.SH"]["name"] == "上证指数"
    assert index_by_code["000001.SH"]["price"] == 3012.44
    assert result["portfolio_today"]["total_value"] == 1100
    assert result["portfolio_today"]["day_pnl"] == 100
    assert result["portfolio_today"]["day_pct"] == 10
    assert result["portfolio_today"]["latest_quote_time"] == now.isoformat()


def test_refresh_market_today_submits_jobs_without_calling_tushare():
    db = make_session()
    user = SimpleNamespace(id=7)

    result = refresh_market_today(db=db, user=user)
    requests = db.query(JobRunRequest).order_by(JobRunRequest.id.asc()).all()

    assert result["status"] == "submitted"
    assert [item.job_name for item in requests] == [
        "stock_analysis.refresh_major_indices_realtime",
        "portfolio.refresh_all_realtime_quotes",
    ]
    assert result["request_ids"] == [item.id for item in requests]
    assert all(item.status == "pending" for item in requests)


def test_workbench_operations_returns_inbox_counts_and_job_status():
    db = make_session()
    now = beijing_now().replace(tzinfo=None)
    track_job = "track_discovery.review_track_events_deepseek"
    db.add_all(
        [
            AiTagSuggestion(suggested_text="新词", status="pending", created_at=now - timedelta(days=2)),
            AiTagSuggestion(suggested_text="已过", status="approved"),
            AlertEvent(rule_id=1, title="预警", message="m", status="unread", event_time=now - timedelta(hours=3)),
            AlertEvent(rule_id=1, title="已读", message="m", status="read", event_time=now),
            # 待办笔记只收 MCP 写入且未分组的
            KnowledgeNote(title="MCP 笔记", content="c", note_type="mcp", status="active", created_at=now - timedelta(hours=1)),
            KnowledgeNote(title="随手记", content="c", note_type="idea", status="active"),
            KnowledgeNote(title="已归档", content="c", note_type="mcp", status="archived"),
            JobConfig(job_name=track_job, module_name="track_discovery", display_name="AI审核赛道事件", description="", next_run_at=now + timedelta(hours=1)),
            JobConfig(job_name="market_radar.fetch_news", module_name="market_radar", display_name="同步财联社", description="", last_status="failed", last_run_at=now),
            JobRunLog(
                job_name=track_job, module_name="track_discovery", trigger_type="schedule", status="success",
                started_at=now - timedelta(minutes=5), finished_at=now - timedelta(minutes=4), duration_ms=41000,
                processed_count=12, inserted_count=3,
            ),
            JobRunLog(
                job_name="market_radar.fetch_news", module_name="market_radar", trigger_type="schedule", status="failed",
                started_at=now - timedelta(minutes=2), finished_at=now - timedelta(minutes=2), duration_ms=30000,
                error_message="timeout after 30s",
            ),
            JobRunRequest(job_name=track_job, status="running", requested_at=now, started_at=now),
        ]
    )
    db.commit()

    result = workbench_operations(db)

    assert {key: value["count"] for key, value in result["todo"].items() if key != "total"} == {
        "suggestions": 1,
        "reports": 0,
        "notes": 1,
        "alerts": 1,
    }
    assert result["todo"]["total"] == 3
    assert result["todo"]["suggestions"]["oldest_at"].startswith((now - timedelta(days=2)).date().isoformat())

    track = next(item for item in result["ai_jobs"] if item["job_name"] == track_job)
    assert track["last_run"]["inserted_count"] == 3
    assert track["last_run"]["duration_ms"] == 41000
    assert track["active_request"]["status"] == "running"
    assert track["next_run_at"] is not None

    assert [item["job_name"] for item in result["failed_jobs"]] == ["market_radar.fetch_news"]
    assert result["failed_jobs"][0]["error_message"] == "timeout after 30s"
    assert [item["job_name"] for item in result["recent_runs"]] == ["market_radar.fetch_news", track_job]
    assert result["recent_runs"][0]["display_name"] == "同步财联社"
    assert result["health"]["failed_jobs"] == 1
    assert result["health"]["running_jobs"] == 1
