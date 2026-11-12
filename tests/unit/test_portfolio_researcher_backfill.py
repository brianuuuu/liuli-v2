"""Pure planning tests: no database connection, table reset, or data writes."""

from datetime import datetime, timezone

from tools.dev.backfill_portfolio_researchers import build_plan

BEFORE = datetime(2026, 11, 12, tzinfo=timezone.utc)


def advice(id=1, **changes):
    return {"id": id, "feedback_id": id, "report_id": id, "researcher_code": None,
            "created_at": "2026-11-10T12:00:00+08:00", "status": "active", "portfolio_id": None,
            "target_trade_date": "2026-11-11", **changes}


def feedback(id=1, **changes):
    return {"id": id, "report_id": id, "researcher_code": "", "title": "实盘组合-2026-11-10-微操报告",
            "created_at": "2026-11-10T12:00:00+08:00", **changes}


def test_backfill_only_blanks_in_linked_legacy_reports_and_is_idempotent():
    a, f = advice(), feedback()
    plan = build_plan([a], [f], BEFORE)
    assert len(plan["updates"]) == 2 and not plan["conflicts"]
    assert {row["new_code"] for row in plan["updates"]} == {"portfolio_001"}
    assert not build_plan([{**a, "researcher_code": "portfolio_001"}], [{**f, "researcher_code": "portfolio_001"}], BEFORE)["updates"]


def test_backfill_preserves_other_identities_and_respects_cutoff():
    plan = build_plan([advice(researcher_code="portfolio_002")], [feedback()], BEFORE)
    assert not plan["updates"] and plan["skipped"]
    assert not build_plan([advice(created_at=BEFORE)], [feedback()], BEFORE)["updates"]


def test_backfill_reports_conflicts_orphans_and_duplicate_active_reports():
    assert build_plan([advice(researcher_code="portfolio_001")], [feedback(researcher_code="portfolio_002")], BEFORE)["conflicts"]
    assert build_plan([advice()], [], BEFORE)["skipped"]
    assert not build_plan([advice()], [feedback(title="标的-2026-11-10-估值报告")], BEFORE)["updates"]
    plan = build_plan([advice(), advice(2, researcher_code="portfolio_001")], [feedback(), feedback(2, researcher_code="portfolio_001")], BEFORE)
    assert plan["conflicts"] and "多份有效报告" in plan["conflicts"][0]["reason"]
