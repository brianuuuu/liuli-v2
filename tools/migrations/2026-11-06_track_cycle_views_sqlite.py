"""Explicit SQLite migration; never imported or run by application startup.

Stop every process using the local database before applying this migration.
Without --apply this script only prints its plan and does not open a database.
With --apply it first writes a consistent SQLite backup under var/db/recovery/,
then replaces only track_trend_snapshot inside one transaction, preserving all
columns, rows, primary keys, constraints, explicit indexes, and table triggers.
Any failed verification rolls back the transaction; the backup remains available.

Existing application table layouts are supported. External views or triggers
depending on this table are rejected before modification for manual review.
The older headline_strength schema must use its own reviewed migration first.
"""

import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import sqlite3


REPO_ROOT = Path(__file__).resolve().parents[2]
DATABASE_PATH = REPO_ROOT / "var" / "db" / "liuli.sqlite3"
TABLE = "track_trend_snapshot"
TEMP_TABLE = "track_trend_snapshot__cycle_views_migration"
SCORE_COLUMNS = (
    "market_heat_score", "growth_speed_score", "concentration_score",
    "cycle_resilience_score", "current_market_size_score", "future_market_size_score",
    "overall_score", "track_grade", "heat_tier",
)
NEW_COLUMNS = {"cycle_views_json": "TEXT", "next_verification_date": "DATE"}


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _identifier_pattern(name: str) -> str:
    escaped = re.escape(name)
    return rf'(?:"{escaped}"|`{escaped}`|\[{escaped}\]|{escaped})'


def replacement_table_sql(original_sql: str, columns: dict[str, tuple]) -> str:
    """Transform existing DDL text only; this function performs no database I/O."""
    missing = set(SCORE_COLUMNS) - columns.keys()
    if missing:
        raise ValueError(f"Unsupported old schema; missing score columns: {sorted(missing)}")
    create_pattern = rf'^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{_identifier_pattern(TABLE)}(?=\s|\()'
    sql, replaced = re.subn(create_pattern, f'CREATE TABLE {quote_identifier(TEMP_TABLE)}', original_sql, count=1, flags=re.IGNORECASE)
    if replaced != 1:
        raise ValueError("Cannot identify the original CREATE TABLE statement")
    for name in SCORE_COLUMNS:
        if not columns[name][3]:
            continue
        pattern = rf'((?:\(|,)\s*{_identifier_pattern(name)}\s+[^,]*?)\s+NOT\s+NULL\b'
        sql, replaced = re.subn(pattern, r'\1', sql, count=1, flags=re.IGNORECASE)
        if replaced != 1:
            raise ValueError(f"Cannot safely remove NOT NULL from {name}")
    additions = [f'{quote_identifier(name)} {kind}' for name, kind in NEW_COLUMNS.items() if name not in columns]
    if additions:
        opening = sql.find("(")
        if opening < 0:
            raise ValueError("CREATE TABLE statement is incomplete")
        # SQLite requires column definitions before table-level PRIMARY/FOREIGN KEY constraints.
        sql = sql[:opening + 1] + "\n    " + ",\n    ".join(additions) + ",\n" + sql[opening + 1:]
    return sql


def _columns(connection: sqlite3.Connection) -> dict[str, tuple]:
    return {row[1]: row for row in connection.execute(f"PRAGMA table_info({quote_identifier(TABLE)})")}


def _backup(connection: sqlite3.Connection, database: Path) -> Path:
    recovery = REPO_ROOT / "var" / "db" / "recovery"
    recovery.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = recovery / f"{database.stem}-before-track-cycle-views-{stamp}.sqlite3"
    # SQLite's backup API also includes committed WAL pages; a plain file copy may not.
    with sqlite3.connect(backup) as destination:
        connection.backup(destination)
        if destination.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise RuntimeError(f"Backup integrity check failed: {backup}")
    return backup


def apply_migration(database: Path) -> Path | None:
    database = database.resolve()
    if database != DATABASE_PATH.resolve():
        raise ValueError(f"This migration only supports the repository database: {DATABASE_PATH}")
    if not database.is_file():
        raise FileNotFoundError(f"Database does not exist: {database}")
    # mode=rw prevents accidental creation of a new database for a mistyped path.
    with sqlite3.connect(database.as_uri() + "?mode=rw", uri=True, isolation_level=None) as connection:
        columns = _columns(connection)
        if not columns:
            raise ValueError(f"{TABLE} does not exist; no migration was applied")
        if set(SCORE_COLUMNS).issubset(columns) and set(NEW_COLUMNS).issubset(columns) and not any(columns[name][3] for name in (*SCORE_COLUMNS, *NEW_COLUMNS)):
            return None
        original_sql = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (TABLE,)).fetchone()[0]
        new_sql = replacement_table_sql(original_sql, columns)
        if connection.execute("SELECT 1 FROM sqlite_master WHERE name=?", (TEMP_TABLE,)).fetchone():
            raise ValueError(f"Temporary table {TEMP_TABLE} already exists; review it manually")
        dependencies = connection.execute(
            "SELECT name, sql FROM sqlite_master WHERE type IN ('view', 'trigger') AND tbl_name != ? AND sql IS NOT NULL", (TABLE,),
        ).fetchall()
        for name, sql in dependencies:
            if re.search(rf'\b{re.escape(TABLE)}\b', sql, re.IGNORECASE):
                raise ValueError(f"Dependent view/trigger {name} needs a reviewed migration; nothing changed")
        if connection.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Existing foreign-key violations need review before migration")
        objects = connection.execute(
            "SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index', 'trigger') AND sql IS NOT NULL", (TABLE,),
        ).fetchall()
        backup = _backup(connection, database)
        print(f"Backup created: {backup}")
        foreign_keys = connection.execute("PRAGMA foreign_keys").fetchone()[0]
        connection.execute("PRAGMA foreign_keys=OFF")
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(new_sql)
            column_list = ", ".join(map(quote_identifier, columns))
            connection.execute(f'INSERT INTO {quote_identifier(TEMP_TABLE)} ({column_list}) SELECT {column_list} FROM {quote_identifier(TABLE)}')
            old_count = connection.execute(f'SELECT count(*) FROM {quote_identifier(TABLE)}').fetchone()[0]
            new_count = connection.execute(f'SELECT count(*) FROM {quote_identifier(TEMP_TABLE)}').fetchone()[0]
            differences = connection.execute(
                f'SELECT 1 FROM (SELECT {column_list} FROM {quote_identifier(TABLE)} EXCEPT SELECT {column_list} FROM {quote_identifier(TEMP_TABLE)}) LIMIT 1',
            ).fetchone()
            if old_count != new_count or differences:
                raise RuntimeError("Copied rows differ from the original; migration rolled back")
            connection.execute(f'DROP TABLE {quote_identifier(TABLE)}')
            connection.execute(f'ALTER TABLE {quote_identifier(TEMP_TABLE)} RENAME TO {quote_identifier(TABLE)}')
            for (sql,) in objects:
                connection.execute(sql)
            updated = _columns(connection)
            if any(name not in updated or updated[name][3] for name in (*SCORE_COLUMNS, *NEW_COLUMNS)):
                raise RuntimeError("The requested nullable columns were not created correctly")
            if connection.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("Foreign-key check failed; migration rolled back")
            if connection.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise RuntimeError("Integrity check failed; migration rolled back")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.execute(f"PRAGMA foreign_keys={foreign_keys}")
    return backup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply after stopping every process using this SQLite database")
    args = parser.parse_args()
    database = DATABASE_PATH.resolve()
    if not args.apply:
        print(f"Plan only; database is not opened: {database}")
        print("Add cycle_views_json and next_verification_date; make the nine score columns nullable.")
        print("Stop database users, then pass --apply. A backup is required and created before any table changes.")
        return
    backup = apply_migration(database)
    print("Migration complete; all original rows preserved." if backup else "Schema is already compatible; no changes made.")


if __name__ == "__main__":
    main()
