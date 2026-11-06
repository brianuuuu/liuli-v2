"""只用对象替身测试查询拼装、响应契约和写入值，不连接数据库。"""

import json
from datetime import date, datetime, timezone
from unittest.mock import patch

from sqlalchemy.dialects import postgresql

from invest_assistant.modules.track_discovery import service
from invest_assistant.modules.track_discovery.models import Track, TrackTrendSnapshot
from invest_assistant.modules.track_discovery.schemas import TrackDetailRead, TrackRead, TrackTrendSnapshotCreate
from invest_assistant.modules.track_discovery.scoring import TRACK_SCORE_FIELDS

NOW = datetime(2026, 11, 6, tzinfo=timezone.utc)


def track():
    return Track(id=1, name="算力", status="active", latest_snapshot_id=2,
                 current_view="当前研究", created_at=NOW, updated_at=NOW)


def snapshots():
    old = TrackTrendSnapshot(
        id=1, track_id=1, report_id=101, research_date=date(2026, 10, 3), headline_cycle="long",
        **{key: 7 for key in TRACK_SCORE_FIELDS}, overall_score=7, track_grade="A", heat_tier="T1",
        cycle_views_json=json.dumps({"long": {"direction": "positive", "judgment": "需求扩张", "confidence": "medium"}}),
        next_verification="核对订单", next_verification_date=date(2026, 11, 1), created_at=NOW,
    )
    latest = TrackTrendSnapshot(
        id=2, track_id=1, report_id=102, research_date=date(2026, 11, 6), headline_cycle="short",
        core_judgment="短期分歧", cycle_views_json=json.dumps({"short": {"direction": "uncertain", "judgment": "待新订单", "confidence": "low"}}),
        next_verification=None, next_verification_date=None, created_at=NOW,
    )
    return latest, old


class ReadSession:
    """所有数据均由构造参数提供，SQL仅编译供断言。"""

    def __init__(self, item, rows):
        self.item, self.rows, self.queries = item, rows, []

    def get(self, model, id):
        assert model is Track
        return self.item

    def scalars(self, stmt):
        self.queries.append(str(stmt.compile(dialect=postgresql.dialect())))
        entity = stmt.column_descriptions[0]["entity"]
        if entity is Track:
            return [self.item]
        if entity is TrackTrendSnapshot:
            return self.rows
        return []


def test_list_and_comparison_show_actual_score_source_not_latest_report_date():
    db = ReadSession(track(), list(snapshots()))
    with patch.object(service, "list_track_tag_bindings", return_value=[]):
        result = service.list_tracks(db)[0]
    parsed = TrackRead.model_validate(result)
    assert parsed.latest_snapshot_id == 2
    assert parsed.research_date == date(2026, 11, 6)
    assert parsed.score_source.research_date == date(2026, 10, 3)
    assert parsed.overall_score == 7
    assert parsed.cycle_views["long"].report_id == 101

    with patch.object(service, "_dashboard_latest_stat_by_window", return_value={}), patch.object(service, "_dashboard_latest_heat_by_track_window", return_value={}):
        compared = service.list_track_comparison(db)[0]
    assert compared["score_source"] == result["score_source"]
    assert compared["cycle_views"] == result["cycle_views"]
    assert compared["next_verification_date"] is None
    assert compared["market_heat_score"] == 7
    history_sql = next(sql for sql in db.queries if "FROM track_trend_snapshot" in sql)
    assert "LIMIT" not in history_sql
    assert "demand_space" not in history_sql


def test_detail_preserves_raw_latest_snapshot_and_exposes_historical_score_separately():
    latest, old = snapshots()
    db = ReadSession(track(), [latest, old])
    empty_stats = {"total": 0, "pending": 0, "high_importance": 0, "last_updated_at": None}
    with (
        patch.object(service, "list_track_tag_bindings", return_value=[]),
        patch.object(service, "_track_material_stats", return_value=empty_stats),
        patch.object(service, "list_materials", return_value=[]),
        patch.object(service, "list_trend_snapshots", return_value=[latest]),
        patch.object(service, "_track_detail_stocks", return_value=[]),
        patch.object(service, "list_track_notes", return_value=[]),
        patch.object(service, "_track_heat_summary", return_value=(0, None)),
    ):
        detail = TrackDetailRead.model_validate(service.get_track_detail(db, 1, include_heat_trends=False))
    assert detail.latest_snapshot.id == 2 and detail.latest_snapshot.overall_score is None
    assert detail.score_snapshot.id == 1 and detail.score_snapshot.overall_score == 7
    assert detail.cycle_views["long"].snapshot_id == 1
    assert detail.trend_snapshots[0].overall_score is None
    assert old.next_verification_date == date(2026, 11, 1)


def test_cycle_only_update_does_not_label_cached_core_judgment_as_new_research():
    latest, old = snapshots()
    latest.core_judgment = None
    item = track()
    db = ReadSession(item, [latest, old])
    with patch.object(service, "list_track_tag_bindings", return_value=[]):
        result = service.list_tracks(db)[0]
    assert result["current_view"] is None
    assert service._latest_snapshot_summary(item, latest)["core_judgment"] is None
    assert item.current_view == "当前研究"


def test_create_without_scores_keeps_all_nine_values_null():
    item = track()
    item.latest_snapshot_id = None

    class WriteRecorder:
        def add(self, value):
            self.added = value
            value.id = 3

        def get(self, model, id):
            return item

        def flush(self):
            pass

        def commit(self):
            pass

        def refresh(self, value):
            pass

    db = WriteRecorder()
    payload = TrackTrendSnapshotCreate(research_date=date(2026, 11, 6), headline_cycle="short", core_judgment="仅更新判断")
    result = service.create_trend_snapshot(db, 1, payload)
    assert all(getattr(result, key) is None for key in (*TRACK_SCORE_FIELDS, "overall_score", "track_grade", "heat_tier"))
    assert item.latest_snapshot_id == 3 and item.current_view == "仅更新判断"
