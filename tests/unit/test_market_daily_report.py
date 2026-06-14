from datetime import date, datetime
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.ai_audit.models import AiRequestLog
from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.knowledge_base.models import KnowledgePrompt
from invest_assistant.modules.knowledge_base.service import DEFAULT_KNOWLEDGE_PROMPTS
from invest_assistant.modules.market_radar.daily_report import (
    DAILY_REPORT_JOB_NAME,
    build_daily_report_payload,
    generate_daily_report,
)
from invest_assistant.modules.market_radar.models import (
    Hotword,
    HotwordTagRelation,
    SourceItem,
    SourceTag,
    StockTagRelation,
    Tag,
    TrackTagRelation,
)
from invest_assistant.modules.track_discovery.models import Track


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
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def test_daily_report_payload_uses_natural_day_entity_dedup_and_full_content():
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        stock = Stock(stock_code="300750", stock_name="宁德时代", exchange="SZSE", status="active")
        track = Track(name="人形机器人", status="active")
        hotword = Hotword(name="固态电池", status="active")
        stock_tag = Tag(name="宁德时代", type="stock", status="active")
        stock_alt_tag = Tag(name="宁王", type="stock", status="active")
        track_tag = Tag(name="人形机器人", type="track", status="active")
        hotword_tag = Tag(name="固态电池", type="hotword", status="active")
        db.add_all([stock, track, hotword, stock_tag, stock_alt_tag, track_tag, hotword_tag])
        db.flush()
        db.add_all(
            [
                StockTagRelation(stock_id=stock.id, tag_id=stock_tag.id, status="active"),
                StockTagRelation(stock_id=stock.id, tag_id=stock_alt_tag.id, status="active"),
                TrackTagRelation(track_id=track.id, tag_id=track_tag.id, status="active"),
                HotwordTagRelation(hotword_id=hotword.id, tag_id=hotword_tag.id, status="active"),
            ]
        )
        first_inside = SourceItem(
            source_type="news",
            source_name="财联社",
            title="宁德时代发布固态电池进展",
            content="完整正文第一段。\n完整正文第二段，不能被截断。",
            publish_time=datetime(2026, 6, 13, 9, 10, 0),
        )
        second_inside = SourceItem(
            source_type="announcement",
            source_name="cninfo",
            title="宁德时代公告补充信息",
            content="第二条完整正文，也必须输入。",
            publish_time=datetime(2026, 6, 13, 10, 30, 0),
        )
        outside = SourceItem(
            source_type="news",
            source_name="财联社",
            title="窗口外信息",
            content="不应进入日报输入",
            publish_time=datetime(2026, 6, 12, 23, 59, 59),
        )
        db.add_all([first_inside, second_inside, outside])
        db.flush()
        db.add_all(
            [
                SourceTag(source_item_id=first_inside.id, tag_id=stock_tag.id, extractor="test"),
                SourceTag(source_item_id=second_inside.id, tag_id=stock_tag.id, extractor="test"),
                SourceTag(source_item_id=first_inside.id, tag_id=stock_alt_tag.id, extractor="test"),
                SourceTag(source_item_id=first_inside.id, tag_id=track_tag.id, extractor="test"),
                SourceTag(source_item_id=first_inside.id, tag_id=hotword_tag.id, extractor="test"),
                SourceTag(source_item_id=outside.id, tag_id=stock_tag.id, extractor="test"),
            ]
        )
        db.commit()

        payload = build_daily_report_payload(db, date(2026, 6, 13))

        assert payload["report_meta"]["report_date"] == "2026-06-13"
        stock_tags = [item for item in payload["hot_tags"] if item["tag_type"] == "stock"]
        assert len(stock_tags) == 1
        assert "entity_id" not in stock_tags[0]
        assert "entity_name" not in stock_tags[0]
        assert "heat_score" not in stock_tags[0]
        assert "source_count" not in stock_tags[0]
        related = stock_tags[0]["related_source_items"]
        assert related == [
            {
                "source_item_id": second_inside.id,
                "content": "第二条完整正文，也必须输入。",
                "publish_time": "2026-06-13T10:30:00+08:00",
            },
            {
                "source_item_id": first_inside.id,
                "content": "完整正文第一段。\n完整正文第二段，不能被截断。",
                "publish_time": "2026-06-13T09:10:00+08:00",
            }
        ]
        assert "summary" not in related[0]
        assert "title" not in related[0]
        assert "source_type" not in related[0]
        assert "source_name" not in related[0]
    finally:
        db.close()


def test_daily_report_default_prompt_is_markdown_professional_and_concise():
    service = __import__(
        "invest_assistant.modules.knowledge_base.service",
        fromlist=["DEFAULT_KNOWLEDGE_PROMPTS", "resolve_prompt_content"],
    )
    prompt = next(item for item in service.DEFAULT_KNOWLEDGE_PROMPTS if item.prompt_key == DAILY_REPORT_JOB_NAME)
    resolved = service.resolve_prompt_content(prompt, variables={"report_date": "2026-06-13"})

    assert prompt.model == "deepseek-v4-pro"
    assert prompt.response_format == "text"
    prompt_file = (
        Path(__file__).parents[2]
        / "invest_assistant"
        / "modules"
        / "knowledge_base"
        / "prompts"
        / "market_radar"
        / "generate_daily_report"
        / "user.md"
    )
    assert prompt.system_prompt.endswith("/system.md")
    assert prompt.user_prompt.endswith("/user.md")
    assert resolved.user_prompt == prompt_file.read_text(encoding="utf-8").strip().replace("{{ report_date }}", "2026-06-13")
    combined_prompt = f"{resolved.system_prompt}\n{resolved.user_prompt}"
    assert "琉璃系统的市场雷达分析员" in resolved.system_prompt
    assert "Markdown" in resolved.system_prompt
    assert "重大事件" in combined_prompt
    assert "潜在重大变量" in combined_prompt
    assert "市场异动" in combined_prompt
    assert "关键变量" in combined_prompt
    assert "source_item_id" in combined_prompt
    assert "高 / 中 / 观察" in combined_prompt
    assert "近期" in combined_prompt
    assert "外部参考" in combined_prompt
    assert "不要输出买入、卖出、目标价、仓位比例" in combined_prompt


def test_daily_report_job_does_not_expose_source_item_limit_param():
    from invest_assistant.modules.market_radar.jobs import JOBS

    job = next(item for item in JOBS if item.job_name == DAILY_REPORT_JOB_NAME)

    assert "per_tag_source_limit" not in (job.params_schema or {})


def test_generate_daily_report_writes_markdown_report_and_ai_log(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    SessionLocal = make_session()
    db = SessionLocal()
    try:
        stock = Stock(stock_code="300750", stock_name="宁德时代", exchange="SZSE", status="active")
        tag = Tag(name="宁德时代", type="stock", status="active")
        db.add_all([stock, tag])
        db.flush()
        db.add(StockTagRelation(stock_id=stock.id, tag_id=tag.id, status="active"))
        source = SourceItem(
            source_type="news",
            source_name="财联社",
            title="宁德时代发布固态电池进展",
            content="完整正文",
            publish_time=datetime(2026, 6, 13, 9, 10, 0),
        )
        db.add(source)
        db.flush()
        db.add(SourceTag(source_item_id=source.id, tag_id=tag.id, extractor="test"))
        prompt_payload = next(item for item in DEFAULT_KNOWLEDGE_PROMPTS if item.prompt_key == DAILY_REPORT_JOB_NAME)
        db.add(KnowledgePrompt(**prompt_payload.model_dump()))
        db.commit()

        class FakeDeepSeek:
            @staticmethod
            def generate_market_daily_report(payload, prompt, model):
                assert payload["hot_tags"][0]["related_source_items"][0]["content"] == "完整正文"
                assert "琉璃系统的市场雷达分析员" in prompt.system_prompt
                assert "# 市场雷达日报｜2026-06-13" in prompt.user_prompt
                assert model == "deepseek-v4-pro"
                return {
                    "content": "# 市场雷达日报｜2026-06-13\n\n一句话结论：固态电池进展值得跟踪。\n来源：source_item #1",
                    "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
                }

        result = generate_daily_report(db, report_date=date(2026, 6, 13), deepseek=FakeDeepSeek)

        assert result.success is True
        report = db.query(Report).one()
        assert report.title == "市场雷达日报｜2026-06-13"
        assert report.report_type == "daily"
        assert report.source_module == "market_radar"
        assert report.file_path == "reports/market_radar/2026-06/market-daily-2026-06-13.md"
        assert (tmp_path / "var" / report.file_path).read_text(encoding="utf-8").startswith("# 市场雷达日报")
        ai_log = db.query(AiRequestLog).one()
        assert ai_log.task_name == DAILY_REPORT_JOB_NAME
        assert ai_log.status == "success"
        assert ai_log.total_tokens == 30
    finally:
        db.close()
