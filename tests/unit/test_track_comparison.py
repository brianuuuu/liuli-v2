"""赛道对比：每个未归档赛道一行，带最新快照的六维分数；没研究过的赛道分数为空，不填 0。"""

from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import invest_assistant.modules.basic.report_library.models  # noqa: F401  # 快照 report_id 的 FK 目标表
from invest_assistant.bootstrap.database import Base
from invest_assistant.modules.track_discovery import service as track_service
from invest_assistant.modules.track_discovery.models import Track, TrackTrendSnapshot
from invest_assistant.modules.track_discovery.scoring import TRACK_SCORE_FIELDS


def make_session():
    """内存库，不碰 var/db 下的任何文件。"""
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, future=True)()


def add_snapshot(db, track: Track, research_date: date, score: float, judgment: str) -> TrackTrendSnapshot:
    snapshot = TrackTrendSnapshot(
        track_id=track.id,
        research_date=research_date,
        researcher_code="track_001",
        headline_cycle="mid",
        core_judgment=judgment,
        key_contradiction="供需错配",
        **{field: score for field in TRACK_SCORE_FIELDS},
        overall_score=score,
        track_grade="B",
        heat_tier="T2",
    )
    db.add(snapshot)
    db.flush()
    return snapshot


def test_comparison_rows_carry_latest_snapshot_scores():
    db = make_session()
    try:
        researched = Track(name="AI 算力", status="active")
        fresh = Track(name="低空经济", status="candidate", current_view="库内观点")
        archived = Track(name="已归档", status="archived")
        db.add_all([researched, fresh, archived])
        db.flush()
        add_snapshot(db, researched, date(2026, 9, 1), 5.0, "旧判断")
        latest = add_snapshot(db, researched, date(2026, 10, 1), 7.5, "新判断")
        researched.latest_snapshot_id = latest.id
        db.commit()

        rows = {row["name"]: row for row in track_service.list_track_comparison(db)}

        assert set(rows) == {"AI 算力", "低空经济"}
        row = rows["AI 算力"]
        assert (row["snapshot_id"], row["research_date"], row["overall_score"]) == (latest.id, date(2026, 10, 1), 7.5)
        assert all(row[field] == 7.5 for field in TRACK_SCORE_FIELDS)
        assert (row["core_judgment"], row["key_contradiction"], row["headline_cycle"]) == ("新判断", "供需错配", "mid")
        assert row["current_heat"] == 0

        empty = rows["低空经济"]
        assert empty["snapshot_id"] is None and empty["track_grade"] is None
        assert all(empty[field] is None for field in TRACK_SCORE_FIELDS)
        # 没研究过时核心判断回落到库内观点
        assert empty["core_judgment"] == "库内观点"
    finally:
        db.close()
