from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
from pathlib import Path
import re
import shutil
import sqlite3

from invest_assistant.modules.knowledge_base.service import format_researcher_profile_markdown


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = PROJECT_ROOT / "var" / "db" / "liuli.sqlite3"
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "var" / "db" / "recovery"
KNOWLEDGE_BASE_RELATIVE_ROOT = Path("invest_assistant") / "modules" / "knowledge_base"
RESEARCHER_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


@dataclass(frozen=True)
class MigrationResult:
    db_path: Path
    backup_path: Path | None
    migrated_count: int
    skipped: bool = False


def _utc_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d%H%M%S")


def _table_exists(con: sqlite3.Connection, table_name: str) -> bool:
    return con.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table_name,)).fetchone() is not None


def _table_columns(con: sqlite3.Connection, table_name: str) -> set[str]:
    if not _table_exists(con, table_name):
        return set()
    return {row[1] for row in con.execute(f"PRAGMA table_info({table_name})").fetchall()}


def _backup_database(db_path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"liuli.sqlite3.researcher-single-table-{_utc_timestamp()}.bak"
    shutil.copy2(db_path, backup_path)
    return backup_path


def _safe_researcher_code(raw_code: str | None, researcher_id: int) -> str:
    code = str(raw_code or "").strip()
    if RESEARCHER_CODE_PATTERN.fullmatch(code):
        return code
    fallback = re.sub(r"[^A-Za-z0-9_-]+", "_", code).strip("_")
    if fallback and RESEARCHER_CODE_PATTERN.fullmatch(fallback):
        return fallback
    return f"researcher_{researcher_id:03d}"


def _resolve_legacy_file(project_root: Path, stored_path: str | None) -> Path | None:
    if not stored_path:
        return None
    path = Path(str(stored_path).strip())
    if path.is_absolute():
        return path
    project_path = project_root / path
    if project_path.exists():
        return project_path
    knowledge_path = project_root / KNOWLEDGE_BASE_RELATIVE_ROOT / path
    return knowledge_path if knowledge_path.exists() else project_path


def _read_legacy_file(project_root: Path, stored_path: str | None) -> str:
    path = _resolve_legacy_file(project_root, stored_path)
    if path is None or not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _profile_path_for_code(researcher_code: str) -> str:
    return f"external/researchers/{researcher_code}/profile.md"


def _write_profile(project_root: Path, researcher_code: str, display_name: str, intro: str, soul: str, method: str) -> tuple[str, str]:
    profile_path = _profile_path_for_code(researcher_code)
    absolute_path = project_root / KNOWLEDGE_BASE_RELATIVE_ROOT / profile_path
    content = format_researcher_profile_markdown(
        researcher_code=researcher_code,
        display_name=display_name,
        intro=intro,
        soul=soul,
        method=method,
    )
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_text(content, encoding="utf-8")
    return profile_path, hashlib.sha256(content.encode("utf-8")).hexdigest()


def migrate_knowledge_researchers(
    db_path: str | Path = DEFAULT_DB_PATH,
    *,
    project_root: str | Path = PROJECT_ROOT,
    backup_dir: str | Path = DEFAULT_BACKUP_DIR,
) -> MigrationResult:
    db_path = Path(db_path)
    project_root = Path(project_root)
    backup_dir = Path(backup_dir)
    if not db_path.exists():
        raise FileNotFoundError(f"database not found: {db_path}")

    backup_path = _backup_database(db_path, backup_dir)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        researcher_columns = _table_columns(con, "knowledge_researcher")
        already_single_table = {
            "id",
            "researcher_code",
            "display_name",
            "profile_path",
            "profile_hash",
            "status",
            "created_at",
            "updated_at",
        }.issubset(researcher_columns)
        legacy_tables_exist = _table_exists(con, "knowledge_researcher_soul") or _table_exists(con, "knowledge_researcher_method")
        if already_single_table and not legacy_tables_exist:
            return MigrationResult(db_path=db_path, backup_path=backup_path, migrated_count=0, skipped=True)
        if not {"id", "name", "soul_id", "method_id"}.issubset(researcher_columns):
            raise RuntimeError("knowledge_researcher is not a supported legacy researcher table")

        souls = {
            row["id"]: row
            for row in con.execute("SELECT * FROM knowledge_researcher_soul").fetchall()
        } if _table_exists(con, "knowledge_researcher_soul") else {}
        methods = {
            row["id"]: row
            for row in con.execute("SELECT * FROM knowledge_researcher_method").fetchall()
        } if _table_exists(con, "knowledge_researcher_method") else {}
        researchers = con.execute("SELECT * FROM knowledge_researcher ORDER BY id").fetchall()

        migrated_rows = []
        now = datetime.now(UTC).replace(tzinfo=None).isoformat(sep=" ")
        used_codes: set[str] = set()
        for row in researchers:
            researcher_id = int(row["id"])
            researcher_code = _safe_researcher_code(row["code"] if "code" in row.keys() else None, researcher_id)
            if researcher_code in used_codes:
                researcher_code = f"{researcher_code}_{researcher_id}"
            used_codes.add(researcher_code)
            soul_row = souls.get(row["soul_id"])
            method_row = methods.get(row["method_id"])
            intro = row["description"] if "description" in row.keys() and row["description"] else ""
            soul = _read_legacy_file(project_root, soul_row["file_path"] if soul_row else None)
            method = _read_legacy_file(project_root, method_row["file_path"] if method_row else None)
            display_name = row["name"]
            profile_path, profile_hash = _write_profile(project_root, researcher_code, display_name, intro, soul, method)
            migrated_rows.append(
                (
                    researcher_id,
                    researcher_code,
                    display_name,
                    profile_path,
                    profile_hash,
                    "active" if row["status"] == "active" else "archived",
                    row["created_at"] if "created_at" in row.keys() and row["created_at"] else now,
                    row["updated_at"] if "updated_at" in row.keys() and row["updated_at"] else now,
                )
            )

        con.execute("BEGIN")
        con.execute("ALTER TABLE knowledge_researcher RENAME TO knowledge_researcher_legacy_merge")
        con.execute(
            """
            CREATE TABLE knowledge_researcher (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                researcher_code VARCHAR(64) NOT NULL,
                display_name VARCHAR(255) NOT NULL,
                profile_path VARCHAR(512) NOT NULL,
                profile_hash VARCHAR(128),
                status VARCHAR(32) NOT NULL DEFAULT 'active',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                CONSTRAINT uq_knowledge_researcher_code UNIQUE (researcher_code)
            )
            """
        )
        con.executemany(
            """
            INSERT INTO knowledge_researcher
              (id, researcher_code, display_name, profile_path, profile_hash, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            migrated_rows,
        )
        con.execute("DROP TABLE knowledge_researcher_legacy_merge")
        if _table_exists(con, "knowledge_researcher_soul"):
            con.execute("DROP TABLE knowledge_researcher_soul")
        if _table_exists(con, "knowledge_researcher_method"):
            con.execute("DROP TABLE knowledge_researcher_method")
        con.commit()
        return MigrationResult(db_path=db_path, backup_path=backup_path, migrated_count=len(migrated_rows))
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge legacy knowledge researcher soul/method tables into knowledge_researcher.")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    parser.add_argument("--project-root", default=str(PROJECT_ROOT), help="liuli-v2 project root")
    parser.add_argument("--backup-dir", default=str(DEFAULT_BACKUP_DIR), help="directory for the required database backup")
    args = parser.parse_args()
    result = migrate_knowledge_researchers(args.db, project_root=args.project_root, backup_dir=args.backup_dir)
    if result.skipped:
        print(f"Already migrated. Backup: {result.backup_path}")
    else:
        print(f"Migrated {result.migrated_count} researcher(s). Backup: {result.backup_path}")


if __name__ == "__main__":
    main()
