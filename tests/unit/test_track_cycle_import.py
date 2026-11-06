"""赛道报告纯内存契约测试：不创建 Session、不连接或修改数据库。"""

import json
from datetime import date

import pytest

from invest_assistant.modules.knowledge_base.models import KnowledgeResearchFeedback
from invest_assistant.modules.knowledge_base.service import _normalize_track_trend_import_payload
from invest_assistant.modules.track_discovery.schemas import TrackTrendSnapshotCreate


RESEARCH_DATE = date(2026, 11, 6)
SCORES = {
    "market_heat_score": 7.5,
    "growth_speed_score": 8.0,
    "concentration_score": 6.5,
    "cycle_resilience_score": 6.0,
    "current_market_size_score": 7.0,
    "future_market_size_score": 8.5,
}


def normalize(**fields):
    payload = {"research_date": "2026-11-06", "headline_cycle": "short", **fields}
    feedback = KnowledgeResearchFeedback(researcher_code="track_analyst_001", report_id=343)
    return _normalize_track_trend_import_payload(payload, feedback, RESEARCH_DATE)


def short_view(**fields):
    return {"direction": "positive", "judgment": "新订单需在下月验证交付。", "confidence": "medium", **fields}


def test_qualitative_report_keeps_only_reviewed_cycle_and_its_own_source():
    normalized = normalize(cycle_views={"short": short_view()}, next_verification_date="2026-12-06")
    assert json.loads(normalized["cycle_views_json"]) == {"short": short_view()}
    assert normalized["next_verification_date"] == date(2026, 12, 6)
    assert normalized["research_date"] == RESEARCH_DATE
    assert normalized["report_id"] == 343
    assert all(normalized[field] is None for field in SCORES)


def test_old_fully_scored_report_needs_no_cycle_views_or_reminder():
    normalized = normalize(**SCORES)
    assert {field: normalized[field] for field in SCORES} == SCORES
    assert normalized["cycle_views_json"] is None
    assert normalized["next_verification_date"] is None
    assert TrackTrendSnapshotCreate(**normalized).market_heat_score == 7.5


def test_explicit_null_scores_and_reminder_do_not_copy_previous_report():
    normalized = normalize(**dict.fromkeys(SCORES), core_judgment="订单尚未落地，维持待验证。", next_verification_date=None)
    assert all(normalized[field] is None for field in SCORES)
    assert normalized["next_verification_date"] is None
    assert TrackTrendSnapshotCreate(**normalized).core_judgment == "订单尚未落地，维持待验证。"


def test_partial_scores_are_rejected_instead_of_filled_or_carried_forward():
    with pytest.raises(ValueError, match="六|评分|score"):
        normalize(market_heat_score=7.5, cycle_views={"short": short_view()})


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1, 11, True])
def test_invalid_score_cannot_enter_a_complete_score_block(value):
    with pytest.raises(ValueError):
        normalize(**{**SCORES, "market_heat_score": value})


@pytest.mark.parametrize("views", [None, {}, {"short": None}])
def test_report_without_scores_or_actual_judgment_is_rejected(views):
    with pytest.raises(ValueError):
        TrackTrendSnapshotCreate(**normalize(cycle_views=views))


@pytest.mark.parametrize("views", [
    [],
    {"quarter": short_view()},
    {"short": short_view(direction="up")},
    {"short": short_view(confidence="certain")},
    {"short": short_view(judgment=" ")},
    {"short": short_view(research_date="2026-11-07")},
    {"short": short_view(report_id=999)},
])
def test_invalid_cycles_or_forged_cycle_sources_are_rejected(views):
    with pytest.raises(ValueError):
        TrackTrendSnapshotCreate(**normalize(**SCORES, cycle_views=views))


def test_uncertain_is_an_explicit_reviewed_judgment():
    model = TrackTrendSnapshotCreate(**normalize(cycle_views={"mid": short_view(direction="uncertain", confidence="low")}))
    assert json.loads(model.cycle_views_json)["mid"]["direction"] == "uncertain"


def test_research_date_must_match_title_and_verification_date_must_be_valid():
    with pytest.raises(ValueError, match="标题日期"):
        normalize(**SCORES, research_date="2026-11-05")
    with pytest.raises(ValueError, match="next_verification_date"):
        normalize(**SCORES, next_verification_date="2026-02-30")
