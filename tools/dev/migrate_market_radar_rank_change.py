from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import shutil
import sys

from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from invest_assistant.bootstrap.config import get_settings  # noqa: E402


def sqlite_path_from_url(database_url: str) -> Path:
    if not database_url.startswith("sqlite:///"):
        raise ValueError(f"unsupported database url: {database_url}")
    raw_path = database_url.replace("sqlite:///", "", 1)
    path = Path(raw_path)
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def backup_database(database_url: str) -> Path:
    db_path = sqlite_path_from_url(database_url)
    recovery_dir = db_path.parent / "recovery"
    recovery_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = recovery_dir / f"{db_path.name}.{stamp}.bak"
    shutil.copy2(db_path, backup_path)
    return backup_path


def _columns(conn, table_name: str) -> set[str]:
    return {row[1] for row in conn.execute(text(f"PRAGMA table_info({table_name})")).all()}


def _tables(conn) -> set[str]:
    return {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).all()}


def _alert_rules_need_migration(conn) -> bool:
    if "alert_rule" not in _tables(conn):
        return False
    rows = conn.execute(text("SELECT condition_json FROM alert_rule")).all()
    for (condition_json,) in rows:
        try:
            condition = json.loads(condition_json or "{}")
        except json.JSONDecodeError:
            continue
        if "min_change_ratio" in condition:
            return True
    return False


def _heat_scores_need_migration(conn) -> bool:
    if "tag_heat_snapshot" not in _tables(conn):
        return False
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM tag_heat_snapshot
            WHERE heat_score != trigger_count OR avg_count != trigger_count
            LIMIT 1
            """
        )
    ).first()
    return row is not None


def _normalize_heat_scores(conn) -> int:
    if "tag_heat_snapshot" not in _tables(conn):
        return 0
    count = int(
        conn.execute(
            text(
                """
                SELECT COUNT(*)
                FROM tag_heat_snapshot
                WHERE heat_score != trigger_count OR avg_count != trigger_count
                """
            )
        ).scalar_one()
        or 0
    )
    if count:
        conn.execute(
            text(
                """
                UPDATE tag_heat_snapshot
                SET heat_score = trigger_count,
                    avg_count = trigger_count
                WHERE heat_score != trigger_count OR avg_count != trigger_count
                """
            )
        )
    return count


def _migrate_alert_rules(conn) -> int:
    if "alert_rule" not in _tables(conn):
        return 0
    rows = conn.execute(text("SELECT id, condition_json FROM alert_rule")).all()
    migrated = 0
    for rule_id, condition_json in rows:
        try:
            condition = json.loads(condition_json or "{}")
        except json.JSONDecodeError:
            continue
        if "min_change_ratio" not in condition:
            continue
        condition.pop("min_change_ratio", None)
        condition.setdefault("min_rank_change", 10)
        conn.execute(
            text("UPDATE alert_rule SET condition_json = :condition_json WHERE id = :rule_id"),
            {"condition_json": json.dumps(condition, ensure_ascii=False), "rule_id": rule_id},
        )
        migrated += 1
    return migrated


def main() -> int:
    database_url = get_settings().database_url
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {},
    )
    if engine.dialect.name != "sqlite":
        print(f"unsupported database dialect: {engine.dialect.name}")
        return 1

    with engine.begin() as conn:
        tables = _tables(conn)
        has_heat_table = "tag_heat_snapshot" in tables
        has_change_ratio = has_heat_table and "change_ratio" in _columns(conn, "tag_heat_snapshot")
        needs_alert_migration = _alert_rules_need_migration(conn)
        needs_heat_score_migration = _heat_scores_need_migration(conn)

    if has_change_ratio or needs_alert_migration or needs_heat_score_migration:
        backup_path = backup_database(database_url)
        print(f"backup created: {backup_path}")

    with engine.begin() as conn:
        normalized = _normalize_heat_scores(conn)
        if normalized:
            print(f"normalized {normalized} heat snapshots to trigger_count heat_score")
        else:
            print("heat snapshots already normalized; skipped")
        if has_change_ratio:
            conn.execute(text("ALTER TABLE tag_heat_snapshot DROP COLUMN change_ratio"))
            print("dropped change_ratio from tag_heat_snapshot")
        else:
            print("change_ratio already absent; skipped")
        migrated = _migrate_alert_rules(conn)
        if migrated:
            print(f"migrated {migrated} alert rule conditions to min_rank_change")
        else:
            print("no alert rule conditions required migration")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
