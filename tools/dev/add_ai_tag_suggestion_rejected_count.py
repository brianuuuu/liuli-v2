from pathlib import Path
import sys

from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from invest_assistant.bootstrap.config import get_settings  # noqa: E402


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
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).all()}
        if "ai_tag_suggestion" not in tables:
            print("table ai_tag_suggestion does not exist")
            return 1

        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(ai_tag_suggestion)")).all()}
        if "rejected_count" in columns:
            print("rejected_count already exists; skipped")
            return 0

        conn.execute(text("ALTER TABLE ai_tag_suggestion ADD COLUMN rejected_count INTEGER NOT NULL DEFAULT 0"))
        print("added rejected_count to ai_tag_suggestion")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
