import json
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, text


TEST_DB_ROOT = Path("var/cache/test-market-radar-heat")


def test_heat_rank_migration_drops_change_ratio_and_migrates_alert_rules():
    TEST_DB_ROOT.mkdir(parents=True, exist_ok=True)
    db_path = TEST_DB_ROOT / f"heat-rank-{uuid4()}.sqlite3"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE tag_heat_snapshot (
                    id INTEGER PRIMARY KEY,
                    tag_id INTEGER NOT NULL,
                    window_type VARCHAR(16) NOT NULL,
                    stat_time DATETIME NOT NULL,
                    trigger_count INTEGER NOT NULL DEFAULT 0,
                        source_count INTEGER NOT NULL DEFAULT 0,
                        heat_score FLOAT NOT NULL DEFAULT 0,
                        avg_count FLOAT NOT NULL DEFAULT 0,
                    change_ratio FLOAT NOT NULL DEFAULT 0,
                    rank_no INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE alert_rule (
                    id INTEGER PRIMARY KEY,
                    condition_json TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                "INSERT INTO alert_rule (condition_json) VALUES (:condition_json)"
            ),
            {"condition_json": json.dumps({"window": "24h", "min_change_ratio": 0.5, "min_heat": 3})},
        )
        conn.execute(
            text(
                """
                INSERT INTO tag_heat_snapshot (
                    tag_id, window_type, stat_time, trigger_count, source_count, heat_score, avg_count, change_ratio, rank_no
                ) VALUES (1, '24h', '2026-06-01 09:00:00', 2, 2, 22, 22, 0.5, 1)
                """
            )
        )

    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path.as_posix()}"}
    command = [sys.executable, "tools/dev/migrate_market_radar_rank_change.py"]
    first = subprocess.run(command, cwd=Path.cwd(), env=env, text=True, capture_output=True, check=True)
    second = subprocess.run(command, cwd=Path.cwd(), env=env, text=True, capture_output=True, check=True)

    with engine.begin() as conn:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(tag_heat_snapshot)"))}
        heat_score, avg_count = conn.execute(text("SELECT heat_score, avg_count FROM tag_heat_snapshot")).one()
        condition_json = conn.execute(text("SELECT condition_json FROM alert_rule")).scalar_one()
    condition = json.loads(condition_json)
    backups = list((db_path.parent / "recovery").glob(f"{db_path.name}.*.bak"))

    assert "change_ratio" not in columns
    assert heat_score == 2
    assert avg_count == 2
    assert "min_change_ratio" not in condition
    assert condition["min_rank_change"] == 10
    assert condition["min_heat"] == 3
    assert backups
    assert "normalized 1 heat snapshots" in first.stdout
    assert "dropped change_ratio" in first.stdout
    assert "change_ratio already absent" in second.stdout
