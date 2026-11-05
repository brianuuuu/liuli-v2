from datetime import date

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateColumn

from invest_assistant.modules.knowledge_base.models import KnowledgeResearchFeedback
from invest_assistant.modules.knowledge_base.service import _normalize_trend_import_payload
from invest_assistant.modules.stock_analysis.models import StockTrendSnapshot


@pytest.mark.parametrize(
    "mainline_cycle",
    [
        "成熟主线处于分歧修复期，等待需求与业绩共同验证",
        "主线进入发酵阶段，等待催化兑现。" * 100,
        "发酵",
        None,
    ],
    ids=["23-characters", "long-description", "short-label", "null"],
)
def test_trend_import_preserves_mainline_cycle_description(mainline_cycle):
    payload = {
        "research_date": "2026-11-05",
        "trend_level": "T3",
        "mainline_cycle": mainline_cycle,
    }
    feedback = KnowledgeResearchFeedback(researcher_code="trend_001", report_id=None)

    # 不提供赛道名，规范化只做内存校验，不连接或修改数据库。
    normalized = _normalize_trend_import_payload(None, payload, feedback, date(2026, 11, 5))

    assert normalized["mainline_cycle"] == mainline_cycle


def test_trend_import_still_rejects_overlong_stock_stage():
    payload = {
        "research_date": "2026-11-05",
        "trend_level": "T3",
        "stock_stage": "修复" * 20,
    }
    feedback = KnowledgeResearchFeedback(researcher_code="trend_001", report_id=None)

    with pytest.raises(ValueError, match="stock_stage 超长：40 字，上限 30 字"):
        _normalize_trend_import_payload(None, payload, feedback, date(2026, 11, 5))


def test_postgresql_stores_mainline_cycle_as_unbounded_text():
    column = StockTrendSnapshot.__table__.c.mainline_cycle

    ddl = str(CreateColumn(column).compile(dialect=postgresql.dialect()))

    assert ddl == "mainline_cycle TEXT"
