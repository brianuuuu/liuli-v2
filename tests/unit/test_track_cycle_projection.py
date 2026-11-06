"""三周期当前视图：只使用普通对象，不创建或连接数据库。"""

import json
from datetime import date, timedelta
from types import SimpleNamespace

from invest_assistant.modules.track_discovery.scoring import TRACK_SCORE_FIELDS
from invest_assistant.modules.track_discovery.research_view import collect_track_reviews as project


def snapshot(id, day, *, track=1, cycles=None, score=None, due=None):
    return SimpleNamespace(
        id=id, track_id=track, research_date=day, report_id=100 + id,
        headline_cycle="short", core_judgment="研究判断", next_verification="查订单",
        next_verification_date=due, cycle_views_json=json.dumps(cycles) if cycles is not None else None,
        **{field: score for field in TRACK_SCORE_FIELDS},
        overall_score=score, track_grade="A" if score is not None else None,
        heat_tier="T1" if score is not None else None,
    )


def view(direction="positive"):
    return {"direction": direction, "judgment": "核验订单兑现", "confidence": "medium"}


def test_short_update_preserves_long_and_score_sources_without_mutating_rows():
    old = snapshot(1, date(2026, 10, 3), cycles={"long": view()}, score=7, due=date(2026, 11, 10))
    new = snapshot(2, date(2026, 11, 6), cycles={"short": view()})
    before = vars(old).copy()
    result = project([new, old])[1]
    assert result.latest is new and result.score is old
    assert result.cycle_views["short"]["research_date"] == new.research_date
    assert result.cycle_views["long"]["research_date"] == old.research_date
    assert result.fields()["score_source"]["report_id"] == old.report_id
    assert result.fields()["next_verification_date"] is None
    assert vars(old) == before and new.overall_score is None


def test_first_unscored_research_has_no_fake_rating():
    result = project([snapshot(1, date(2026, 11, 6), cycles={"short": view()})])[1]
    assert result.score is None
    for field in ("score_source", "overall_score", "track_grade", "heat_tier"):
        assert result.fields()[field] is None


def test_same_day_revision_wins_but_late_old_report_cannot_replace_it():
    first = snapshot(1, date(2026, 11, 6), cycles={"short": view()})
    revised = snapshot(2, first.research_date, cycles={"short": view("uncertain")})
    backfill = snapshot(3, date(2026, 10, 3), cycles={"short": view("negative")}, score=7)
    result = project([backfill, first, revised])[1]
    assert result.latest is revised
    assert result.cycle_views["short"]["direction"] == "uncertain"
    assert result.cycle_views["short"]["snapshot_id"] == 2


def test_long_view_can_come_from_more_than_thirty_snapshots_ago():
    oldest = snapshot(1, date(2026, 1, 1), cycles={"long": view()}, score=0)
    rows = [oldest] + [snapshot(i, oldest.research_date + timedelta(days=i), cycles={"short": view()}) for i in range(2, 45)]
    result = project(reversed(rows))[1]
    assert result.cycle_views["long"]["snapshot_id"] == oldest.id
    assert result.score.overall_score == 0


def test_tracks_are_independent_and_legacy_reports_do_not_invent_cycles():
    legacy = snapshot(1, date(2026, 10, 3), score=7)
    other = snapshot(2, date(2026, 11, 6), track=2, cycles={"mid": view()})
    result = project([other, legacy])
    assert result[1].cycle_views == {}
    assert result[2].score is None and set(result[2].cycle_views) == {"mid"}


def test_malformed_old_json_or_partial_scores_do_not_become_current_evidence():
    old = snapshot(1, date(2026, 10, 3), cycles={"short": view()}, score=7)
    broken = snapshot(2, date(2026, 11, 6), score=8)
    broken.cycle_views_json = "{broken"
    broken.growth_speed_score = None
    result = project([broken, old])[1]
    assert result.score is old
    assert result.cycle_views["short"]["snapshot_id"] == old.id
