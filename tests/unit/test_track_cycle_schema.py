"""Pure Pydantic contract tests; no engine, Session, fixtures, or database access."""

import json
import importlib.util
from pathlib import Path
import unittest
from datetime import date, datetime, timezone

from pydantic import ValidationError

from invest_assistant.modules.track_discovery import schemas


SCORES = {
    "market_heat_score": 8.0,
    "growth_speed_score": 7.0,
    "concentration_score": 6.0,
    "cycle_resilience_score": 5.0,
    "current_market_size_score": 4.0,
    "future_market_size_score": 9.0,
}
SHORT_VIEW = {"direction": "positive", "judgment": "订单开始兑现", "confidence": "medium"}


def payload(**changes):
    return {"research_date": "2026-11-06", "headline_cycle": "short", **changes}


class TrackCycleSchemaTests(unittest.TestCase):
    def test_legacy_complete_score_report_remains_valid(self):
        snapshot = schemas.TrackTrendSnapshotCreate(**payload(**SCORES))
        self.assertEqual(snapshot.market_heat_score, 8.0)
        self.assertIsNone(snapshot.cycle_views_json)
        self.assertIsNone(snapshot.next_verification_date)

    def test_first_qualitative_report_needs_no_previous_scores(self):
        snapshot = schemas.TrackTrendSnapshotCreate(**payload(core_judgment="需求拐点需要验证"))
        self.assertTrue(all(getattr(snapshot, field) is None for field in SCORES))

    def test_actual_cycle_view_is_enough_without_core_judgment(self):
        snapshot = schemas.TrackTrendSnapshotCreate(**payload(
            cycle_views_json=json.dumps({"short": SHORT_VIEW}),
            next_verification_date="2026-12-01",
        ))
        self.assertEqual(json.loads(snapshot.cycle_views_json), {"short": SHORT_VIEW})
        self.assertEqual(snapshot.next_verification_date, date(2026, 12, 1))
        self.assertIsNone(snapshot.market_heat_score)

    def test_empty_unscored_report_is_rejected(self):
        for core in (None, "", " \n "):
            for views in (None, "{}"):
                with self.subTest(core=core, views=views), self.assertRaises(ValidationError):
                    schemas.TrackTrendSnapshotCreate(**payload(core_judgment=core, cycle_views_json=views))

    def test_partial_score_groups_are_rejected(self):
        for omitted in SCORES:
            with self.subTest(omitted=omitted), self.assertRaises(ValidationError):
                schemas.TrackTrendSnapshotCreate(**payload(
                    **{key: value for key, value in SCORES.items() if key != omitted},
                    core_judgment="有判断也不能掩盖缺少评分",
                ))

    def test_explicit_null_group_and_real_zero_group_are_distinct(self):
        empty = schemas.TrackTrendSnapshotCreate(**payload(
            **dict.fromkeys(SCORES), core_judgment="本次只做定性判断",
        ))
        zero = schemas.TrackTrendSnapshotCreate(**payload(**dict.fromkeys(SCORES, 0)))
        self.assertIsNone(empty.market_heat_score)
        self.assertEqual(zero.market_heat_score, 0)

    def test_nonfinite_out_of_range_and_boolean_scores_are_rejected(self):
        for invalid in (float("nan"), float("inf"), -float("inf"), -1, 11, True):
            with self.subTest(value=invalid), self.assertRaises(ValidationError):
                schemas.TrackTrendSnapshotCreate(**payload(**{**SCORES, "market_heat_score": invalid}))

    def test_cycle_json_rejects_invalid_shapes_enums_and_extra_fields(self):
        invalid_objects = [
            [], {"year": SHORT_VIEW}, {"short": None},
            {"short": {**SHORT_VIEW, "direction": "up"}},
            {"short": {**SHORT_VIEW, "confidence": "certain"}},
            {"short": {**SHORT_VIEW, "judgment": " \n "}},
            {"short": {**SHORT_VIEW, "research_date": "2026-01-01"}},
            {"short": {**SHORT_VIEW, "snapshot_id": 99}},
            {"short": {"direction": "positive", "judgment": "缺少置信度"}},
        ]
        for value in ["not json", "", *map(json.dumps, invalid_objects)]:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                schemas.TrackTrendSnapshotCreate(**payload(**SCORES, cycle_views_json=value))

    def test_uncertain_is_an_explicit_update_not_a_missing_key(self):
        views = {"long": {"direction": "uncertain", "judgment": "原假设需要重新验证", "confidence": "low"}}
        snapshot = schemas.TrackTrendSnapshotCreate(**payload(cycle_views_json=json.dumps(views)))
        self.assertEqual(json.loads(snapshot.cycle_views_json), views)

    def test_invalid_verification_date_is_rejected(self):
        with self.assertRaises(ValidationError):
            schemas.TrackTrendSnapshotCreate(**payload(**SCORES, next_verification_date="2026-02-30"))

    def test_read_models_keep_raw_unscored_snapshot_and_separate_sources(self):
        now = datetime(2026, 11, 6, tzinfo=timezone.utc)
        source = {"snapshot_id": 3, "report_id": 12, "research_date": "2026-10-01"}
        latest = {**payload(core_judgment="本次未重新评分"), "id": 4, "track_id": 1, "created_at": now}
        track = {
            "id": 1, "name": "示例赛道", "created_at": now, "updated_at": now,
            "research_date": "2026-11-06", "next_verification_date": None,
            "cycle_views": {"short": {**SHORT_VIEW, **source}}, "score_source": source,
        }
        detail = schemas.TrackDetailRead(
            track=track, summary={}, latest_snapshot=latest,
            cycle_views=track["cycle_views"], score_source=source,
            score_snapshot={**latest, **SCORES, "id": 3, "research_date": "2026-10-01",
                            "overall_score": 6.5, "track_grade": "B", "heat_tier": "T1"},
        )
        self.assertIsNone(detail.latest_snapshot.overall_score)
        self.assertIsNone(detail.latest_snapshot.cycle_views_json)
        self.assertEqual(detail.score_source.snapshot_id, 3)
        self.assertEqual(detail.cycle_views["short"].research_date, date(2026, 10, 1))
        self.assertEqual(detail.track.research_date, date(2026, 11, 6))
        self.assertEqual(detail.score_snapshot.overall_score, 6.5)


class TrackCycleMigrationDdlTests(unittest.TestCase):
    """Exercise only the DDL text transformer, never the migration entry point."""

    def test_sqlite_transform_preserves_columns_and_inserts_before_constraints(self):
        path = Path(__file__).resolve().parents[2] / "tools/migrations/2026-11-06_track_cycle_views_sqlite.py"
        spec = importlib.util.spec_from_file_location("track_cycle_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        score_fields = [*SCORES, "overall_score", "track_grade", "heat_tier"]
        definitions = [f'"{name}" FLOAT NOT NULL' for name in score_fields]
        original = 'CREATE TABLE "track_trend_snapshot" (id INTEGER NOT NULL, research_date DATE NOT NULL, ' + ", ".join(definitions) + ', custom_note TEXT, PRIMARY KEY (id))'
        columns = {name: (index, name, "FLOAT", 1, None, 0) for index, name in enumerate(score_fields)}
        result = migration.replacement_table_sql(original, columns)
        self.assertLess(result.index('"cycle_views_json" TEXT'), result.index("PRIMARY KEY (id)"))
        self.assertIn("research_date DATE NOT NULL", result)
        self.assertIn("custom_note TEXT", result)
        self.assertIn("PRIMARY KEY (id)", result)
        self.assertEqual(result.count("NOT NULL"), 2)
        self.assertIn('CREATE TABLE "track_trend_snapshot__cycle_views_migration"', result)


if __name__ == "__main__":
    unittest.main()
