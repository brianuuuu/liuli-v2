from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
import hashlib
import json
from threading import Barrier
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.basic.report_library.models import Report
from invest_assistant.modules.basic.stock_master.models import Stock
from invest_assistant.modules.basic.system_config.models import SystemConfig
from invest_assistant.modules.knowledge_base.models import KnowledgeResearchFeedback
from invest_assistant.modules.knowledge_base import service as knowledge_service
from invest_assistant.modules.knowledge_base.service import import_research_feedback
from invest_assistant.modules.stock_analysis import service
from invest_assistant.modules.stock_analysis.models import StockScoreSnapshot, ensure_stock_analysis_schema
from invest_assistant.modules.stock_analysis.schemas import StockScoreSnapshotCreate, StockScoreSnapshotRead
from invest_assistant.modules.stock_analysis.score_continuity import (
    NUMERIC_FIELDS, ScoreContinuity, validate_score_changes,
)


def values(**changes):
    return {"report_time": date(2026, 11, 7), "researcher_code": "analyst_001",
            **dict.fromkeys(NUMERIC_FIELDS, 8.0), "investment_level": "A", "core_logic": "逻辑", "primary_risk": "风险", **changes}


def continuity(*, baseline=None, previous=None, next_items=None, reasons=None):
    return {"previous_report_id": baseline, "change_reasons": reasons or [], "previous_checks": previous or [], "next_checks": next_items or []}


def reply(report_id=1, result="pending"):
    return {"report_id": report_id, "check_id": "cash", "result": result, "reason": "待年报验证", "evidence": []}


@pytest.mark.parametrize("number", [None, True, float("nan"), float("inf"), -1, 11])
def test_invalid_scores_cannot_enter_any_write_path(number):
    with pytest.raises(ValueError):
        StockScoreSnapshotCreate(**values(total_score=number))


@pytest.mark.parametrize("extra", [{"continuity": None}, {"previous_snapshot_id": None}, {"continuity": {"change_reasons": [], "previous_checks": [], "next_checks": []}}])
def test_partial_new_contract_cannot_fall_back_to_legacy(extra):
    with pytest.raises(ValueError):
        StockScoreSnapshotCreate(**values(**extra))


@pytest.fixture
def database(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'new-score-tests.sqlite3').as_posix()}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine, tables=[Stock.__table__, Report.__table__, SystemConfig.__table__,
                                           KnowledgeResearchFeedback.__table__, StockScoreSnapshot.__table__])
    with Session(engine, expire_on_commit=False) as db:
        db.add(Stock(id=1, stock_code="600001", stock_name="测试公司"))
        db.commit()
    yield engine
    engine.dispose()


def add_feedback(db, tmp_path, payload, research_date=date(2026, 11, 7)):
    path = tmp_path / f"report-{len(list(tmp_path.glob('report-*.md')))}.md"
    path.write_text("```json\n" + json.dumps({"company_code": "600001", **payload}, default=str) + "\n```", encoding="utf-8")
    report = Report(title=f"测试公司-{research_date}-标的评级报告", report_type="mcp_upload", source_module="stock_analysis", file_path=str(path))
    db.add(report)
    db.flush()
    feedback = KnowledgeResearchFeedback(title=report.title, report_id=report.id, researcher_code="analyst_001", status="received")
    db.add(feedback)
    db.commit()
    return feedback


def test_import_is_atomic_and_idempotent(database, tmp_path, monkeypatch):
    with Session(database, expire_on_commit=False) as db:
        feedback = add_feedback(db, tmp_path, values(continuity=continuity(next_items=[{"id": "cash", "condition": "年报回款"}])))
        real_commit = db.commit
        monkeypatch.setattr(db, "commit", lambda: (_ for _ in ()).throw(RuntimeError("commit failed")))
        with pytest.raises(RuntimeError, match="commit failed"):
            import_research_feedback(db, feedback.id)
        monkeypatch.setattr(db, "commit", real_commit)
        assert db.scalar(select(func.count()).select_from(StockScoreSnapshot)) == 0
        assert db.get(KnowledgeResearchFeedback, feedback.id).status == "received"
        first = import_research_feedback(db, feedback.id)
        second = import_research_feedback(db, feedback.id)
        assert first["score"]["id"] == second["score"]["id"]
        assert first["score"]["report_id"] == feedback.report_id
        assert db.scalar(select(func.count()).select_from(StockScoreSnapshot)) == 1


def test_pause_and_rollback_guard_reject_before_writing(database, tmp_path):
    with Session(database, expire_on_commit=False) as db:
        feedback = add_feedback(db, tmp_path, values(continuity=continuity(next_items=[{"id": "cash", "condition": "年报"}])))
        mode = SystemConfig(config_key="stock_analysis.score_import_mode", config_value="legacy_only", module_name="stock_analysis")
        db.add(mode)
        db.commit()
        with pytest.raises(ValueError, match="仅兼容旧格式"):
            import_research_feedback(db, feedback.id)
        mode.config_value = "paused"
        db.commit()
        with pytest.raises(ValueError, match="暂停"):
            service.create_score(db, 1, StockScoreSnapshotCreate(**values()))
        assert db.scalar(select(func.count()).select_from(StockScoreSnapshot)) == 0


@pytest.mark.parametrize("structured", [False, True])
def test_concurrent_import_returns_one_snapshot(database, tmp_path, monkeypatch, structured):
    with Session(database) as db:
        extra = {"continuity": continuity(next_items=[{"id": "cash", "condition": "年报"}])} if structured else {}
        feedback_id = add_feedback(db, tmp_path, values(**extra)).id
    barrier = Barrier(2)
    original = service.create_score

    def simultaneous(*args, **kwargs):
        barrier.wait(timeout=10)
        return original(*args, **kwargs)

    monkeypatch.setattr(service, "create_score", simultaneous)

    def import_once():
        with Session(database, expire_on_commit=False) as db:
            return import_research_feedback(db, feedback_id)["score"]["id"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        result = list(executor.map(lambda _: import_once(), range(2)))
    assert result[0] == result[1]
    with Session(database) as db:
        assert db.scalar(select(func.count()).select_from(StockScoreSnapshot)) == 1


def test_failed_validation_leaves_feedback_pending(database, tmp_path):
    with Session(database, expire_on_commit=False) as db:
        for extra in ({"report_time": "2026-11-06"}, {"researcher_code": "other"}, {"continuity": None}):
            feedback = add_feedback(db, tmp_path, values(continuity=continuity(
                next_items=[{"id": "cash", "condition": "年报"}],
            )) | extra)
            with pytest.raises(ValueError):
                import_research_feedback(db, feedback.id)
            assert db.get(KnowledgeResearchFeedback, feedback.id).status == "received"
        assert db.scalar(select(func.count()).select_from(StockScoreSnapshot)) == 0


def test_incremental_sqlite_migration_keeps_rows_and_allows_null_sources(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'legacy.sqlite3').as_posix()}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE stock_score_snapshot (id INTEGER PRIMARY KEY, total_score REAL)"))
        conn.execute(text("INSERT INTO stock_score_snapshot VALUES (1, 8.79), (2, 8.67)"))
    ensure_stock_analysis_schema(engine)
    ensure_stock_analysis_schema(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT id, total_score, report_id, previous_snapshot_id, continuity_json FROM stock_score_snapshot ORDER BY id")).all() == [
            (1, 8.79, None, None, None), (2, 8.67, None, None, None),
        ]
        indexes = conn.execute(text("PRAGMA index_list(stock_score_snapshot)")).all()
        assert any(row[1] == "uq_stock_score_snapshot_report_id" and row[2] == 1 for row in indexes)
    engine.dispose()


def test_profile_hash_matches_file_content_after_contract_update(monkeypatch):
    content = "# Profile\n\n## Method\n\nContinuity 1.0.50\n"
    monkeypatch.setattr(knowledge_service, "_read_researcher_profile", lambda _path: content)
    now = datetime.now(timezone.utc)
    item = SimpleNamespace(id=1, researcher_code="analyst_001", display_name="标的评级师", profile_path="profile.md",
                           profile_hash="old", status="active", created_at=now, updated_at=now)
    assert knowledge_service._researcher_read(item).profile_hash == hashlib.sha256(content.encode()).hexdigest()


def test_checks_cross_the_three_period_window_and_close_without_a_full_ledger(database, tmp_path):
    with Session(database, expire_on_commit=False) as db:
        def report(day, **extra):
            when = date(2026, 11, day)
            return add_feedback(db, tmp_path, values(report_time=when, **extra), research_date=when)

        add_feedback(db, tmp_path, values())
        first_feedback = report(1, continuity=continuity(next_items=[{"id": "cash", "condition": "年报回款"}]))
        first = import_research_feedback(db, first_feedback.id)["score"]
        assert first["report_id"] != first["id"]
        second = import_research_feedback(db, report(2).id)["score"]
        third_feedback = report(3, continuity=continuity(
            baseline=second["report_id"], previous=[reply(first["report_id"])],
        ))
        third = import_research_feedback(db, third_feedback.id)["score"]
        assert third["previous_snapshot_id"] == second["id"]
        assert third["comparison"]["total_delta"] == 0
        assert third["check_sources"][0]["condition"] == "年报回款"
        StockScoreSnapshotRead.model_validate(third)
        fourth = report(4, continuity=continuity(baseline=third["report_id"], previous=[reply(first["report_id"])]))
        import_research_feedback(db, fourth.id)
        fifth = report(5, continuity=continuity(baseline=fourth.report_id, previous=[
            reply(first["report_id"], "supported") | {"reason": "已披露回款改善", "evidence": ["年报现金流量表"]},
        ]))
        closed = import_research_feedback(db, fifth.id)["score"]
        assert closed["check_sources"][0]["condition"] == "年报回款"
        assert closed["continuity"]["previous_checks"][0]["result"] == "supported"
        later = report(6, continuity=continuity(baseline=fifth.report_id))
        assert import_research_feedback(db, later.id)["score"]["continuity"]["previous_checks"] == []
        assert import_research_feedback(db, first_feedback.id)["score"]["id"] == first["id"]


def test_unimported_report_is_readable_without_creating_or_rebinding_a_snapshot(database, tmp_path):
    with Session(database, expire_on_commit=False) as db:
        first = add_feedback(db, tmp_path, values(continuity=continuity(next_items=[{"id": "cash", "condition": "年报回款"}])))
        current = add_feedback(db, tmp_path, values(continuity=continuity(baseline=first.report_id, previous=[reply(first.report_id)])))
        result = import_research_feedback(db, current.id)["score"]
        assert result["previous_snapshot_id"] is None
        assert result["comparison"]["status"] == "report_only"
        assert result["comparison"]["report_id"] == first.report_id
        assert result["check_sources"][0]["condition"] == "年报回款"
        assert result["check_sources"][0]["report_available"] is True
        assert db.scalar(select(func.count()).select_from(StockScoreSnapshot)) == 1
        import_research_feedback(db, first.id)
        saved = service.read_score_rows(db, [db.get(StockScoreSnapshot, result["id"])])[0]
        assert saved["comparison"]["status"] == "report_only"
        assert saved["previous_snapshot_id"] is None


@pytest.mark.parametrize("scope", ["stock", "author", "future"])
@pytest.mark.parametrize("imported", [False, True])
def test_reference_scope_is_checked_without_scanning_history(database, tmp_path, scope, imported):
    with Session(database, expire_on_commit=False) as db:
        db.add(Stock(id=2, stock_code="600002", stock_name="另一公司"))
        db.commit()
        source_values = values(continuity=continuity(next_items=[{"id": "cash", "condition": "年报"}]))
        source_values.update({"company_code": "600002"} if scope == "stock" else {"researcher_code": "other"} if scope == "author" else {"report_time": "2026-11-08"})
        feedback = add_feedback(db, tmp_path, source_values)
        if scope == "future":
            db.get(Report, feedback.report_id).title = "测试公司-2026-11-08-标的评级报告"
            db.commit()
        if imported:
            creation = {key: value for key, value in source_values.items() if key != "company_code"}
            service.create_score(db, 2 if scope == "stock" else 1, StockScoreSnapshotCreate(**creation), report_id=feedback.report_id)
        with pytest.raises(ValueError, match="标的、研究员或研究日期不符"):
            service.create_score(db, 1, StockScoreSnapshotCreate(**values(continuity=continuity(baseline=feedback.report_id))))


def test_invalid_reference_and_self_reference_are_rejected(database, tmp_path):
    with Session(database, expire_on_commit=False) as db:
        first = add_feedback(db, tmp_path, values(continuity=continuity()))
        for body, message in (
            (continuity(baseline=999), "报告不存在"),
            (continuity(previous=[reply(first.report_id)]), "无效验证引用"),
        ):
            with pytest.raises(ValueError, match=message):
                service.create_score(db, 1, StockScoreSnapshotCreate(**values(continuity=body)))
        with pytest.raises(ValueError, match="本次报告"):
            service.create_score(db, 1, StockScoreSnapshotCreate(**values(continuity=continuity(baseline=first.report_id))), report_id=first.report_id)


def test_duplicate_checks_and_unexplained_corrections_are_rejected():
    with pytest.raises(ValueError, match="重复"):
        ScoreContinuity.model_validate(continuity(previous=[reply(), reply()]))
    changed = values(total_score=8.1, continuity=continuity(baseline=10))
    with pytest.raises(ValueError, match="total_score"):
        validate_score_changes(changed, values())
    changed["continuity"]["change_reasons"] = [{"field": "total_score", "type": "data_correction", "reason": "修正计算", "evidence": ["原计算式"]}]
    validate_score_changes(changed, values())


@pytest.mark.parametrize("imported", [False, True])
def test_change_reasons_do_not_depend_on_baseline_import(database, tmp_path, imported):
    with Session(database, expire_on_commit=False) as db:
        first = add_feedback(db, tmp_path, values())
        if imported:
            import_research_feedback(db, first.id)
        body = continuity(baseline=first.report_id)
        changed = values(**dict.fromkeys(NUMERIC_FIELDS, 5), investment_level="C", continuity=body)
        current = add_feedback(db, tmp_path, changed)
        with pytest.raises(ValueError, match="评分变化缺少原因"):
            import_research_feedback(db, current.id)
        body["change_reasons"] = [
            {"field": field, "type": "new_evidence", "reason": "盈利下修", "evidence": ["最新业绩公告"]}
            for field in (*NUMERIC_FIELDS[:-1], "investment_level")
        ]
        accepted = add_feedback(db, tmp_path, changed)
        result = import_research_feedback(db, accepted.id)["score"]
        assert (result["previous_snapshot_id"] is not None) is imported


def test_raw_history_uses_import_precision_and_keeps_unknown_scores_unknown():
    baseline = values(certainty_score="8.123456", total_score="8.123456")
    current = values(certainty_score=8.1235, total_score=8.1235, continuity=continuity(baseline=10))
    validate_score_changes(current, baseline)
    baseline.update(certainty_score=None, growth_score=True, total_score=float("nan"))
    validate_score_changes(current, baseline)
    baseline["management_score"] = 7
    with pytest.raises(ValueError, match="management_score"):
        validate_score_changes(current, baseline)


def test_one_score_reads_only_its_sources_once(database, tmp_path, monkeypatch):
    with Session(database, expire_on_commit=False) as db:
        first = add_feedback(db, tmp_path, values(continuity=continuity(next_items=[{"id": "cash", "condition": "年报回款"}])))
        base = import_research_feedback(db, first.id)["score"]
        current = add_feedback(db, tmp_path, values(continuity=continuity(baseline=first.report_id, previous=[reply(first.report_id)])))
        saved = import_research_feedback(db, current.id)["score"]
        db.add_all([StockScoreSnapshot(stock_id=1, **values()) for _ in range(100)])
        db.commit()
        converted, checked = [], set()
        original = service._score_snapshot_dict
        def record(item):
            converted.append(item.id)
            return original(item)
        monkeypatch.setattr(service, "_score_snapshot_dict", record)
        monkeypatch.setattr(service, "_available_score_reports", lambda _db, ids: checked.update(ids) or ids)
        row = db.get(StockScoreSnapshot, saved["id"])
        result = service.read_score_rows(db, [row])[0]
        assert sorted(converted) == sorted([base["id"], saved["id"]])
        assert checked == {first.report_id, current.report_id}
        assert result["check_sources"][0]["condition"] == "年报回款"
