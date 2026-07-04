from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
from pathlib import Path
import shutil
import sqlite3

from invest_assistant.modules.knowledge_base.service import (
    format_researcher_profile_markdown,
    parse_researcher_profile_markdown,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = PROJECT_ROOT / "var" / "db" / "liuli.sqlite3"
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "var" / "db" / "recovery"
KNOWLEDGE_BASE_RELATIVE_ROOT = Path("invest_assistant") / "modules" / "knowledge_base"
RESEARCHER_PROFILE_RELATIVE_ROOT = Path("external") / "researchers"


@dataclass(frozen=True)
class NormalizeResult:
    db_path: Path
    backup_path: Path
    normalized_count: int


def _utc_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d%H%M%S")


def _backup_database(db_path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"liuli.sqlite3.researcher-profile-frontmatter-{_utc_timestamp()}.bak"
    shutil.copy2(db_path, backup_path)
    return backup_path


def _resolve_profile_path(project_root: Path, stored_path: str) -> Path:
    knowledge_root = (project_root / KNOWLEDGE_BASE_RELATIVE_ROOT).resolve()
    profile_root = (knowledge_root / RESEARCHER_PROFILE_RELATIVE_ROOT).resolve()
    path = Path(str(stored_path or "").strip())
    resolved = path.resolve() if path.is_absolute() else (knowledge_root / path).resolve()
    if not resolved.is_relative_to(profile_root):
        raise ValueError(f"researcher profile path must be under {profile_root}: {stored_path}")
    return resolved


def normalize_researcher_profiles(
    db_path: str | Path = DEFAULT_DB_PATH,
    *,
    project_root: str | Path = PROJECT_ROOT,
    backup_dir: str | Path = DEFAULT_BACKUP_DIR,
) -> NormalizeResult:
    db_path = Path(db_path)
    project_root = Path(project_root)
    backup_dir = Path(backup_dir)
    if not db_path.exists():
        raise FileNotFoundError(f"database not found: {db_path}")

    backup_path = _backup_database(db_path, backup_dir)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    normalized_count = 0
    now = datetime.now(UTC).replace(tzinfo=None).isoformat(sep=" ")
    try:
        rows = con.execute(
            """
            SELECT id, researcher_code, display_name, profile_path
            FROM knowledge_researcher
            ORDER BY id
            """
        ).fetchall()
        for row in rows:
            profile_path = _resolve_profile_path(project_root, row["profile_path"])
            existing = profile_path.read_text(encoding="utf-8") if profile_path.exists() else ""
            sections = parse_researcher_profile_markdown(existing)
            if existing.strip() and not any(sections.values()):
                continue
            normalized = format_researcher_profile_markdown(
                researcher_code=row["researcher_code"],
                display_name=row["display_name"],
                intro=sections["intro"],
                soul=sections["soul"],
                method=sections["method"],
            )
            if normalized == existing:
                continue
            profile_path.parent.mkdir(parents=True, exist_ok=True)
            profile_path.write_text(normalized, encoding="utf-8")
            profile_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
            con.execute(
                """
                UPDATE knowledge_researcher
                SET profile_hash = ?, updated_at = ?
                WHERE id = ?
                """,
                (profile_hash, now, row["id"]),
            )
            normalized_count += 1
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
    return NormalizeResult(db_path=db_path, backup_path=backup_path, normalized_count=normalized_count)


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize knowledge researcher profile.md files with frontmatter.")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    parser.add_argument("--project-root", default=str(PROJECT_ROOT), help="liuli-v2 project root")
    parser.add_argument("--backup-dir", default=str(DEFAULT_BACKUP_DIR), help="directory for the required database backup")
    args = parser.parse_args()
    result = normalize_researcher_profiles(args.db, project_root=args.project_root, backup_dir=args.backup_dir)
    print(f"Normalized {result.normalized_count} researcher profile(s). Backup: {result.backup_path}")


if __name__ == "__main__":
    main()
