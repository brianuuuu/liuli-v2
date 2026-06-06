from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Sequence

from sqlalchemy import Engine, Table, create_engine, func, insert, inspect, select, text

from invest_assistant.bootstrap.database import Base, build_engine_options, normalize_database_url

DEFAULT_SQLITE_URL = "sqlite:///./var/db/liuli.sqlite3"


class MigrationSafetyError(RuntimeError):
    pass


@dataclass(frozen=True)
class TableMigrationResult:
    table_name: str
    source_count: int
    inserted_count: int
    skipped_reason: str | None = None


def import_all_models() -> None:
    import invest_assistant.modules.basic.auth.models  # noqa: F401
    import invest_assistant.modules.basic.ai_audit.models  # noqa: F401
    import invest_assistant.modules.basic.disclosure_library.models  # noqa: F401
    import invest_assistant.modules.basic.job_center.models  # noqa: F401
    import invest_assistant.modules.basic.report_library.models  # noqa: F401
    import invest_assistant.modules.basic.stock_master.models  # noqa: F401
    import invest_assistant.modules.basic.system_config.models  # noqa: F401
    import invest_assistant.modules.alert_center.models  # noqa: F401
    import invest_assistant.modules.knowledge_base.models  # noqa: F401
    import invest_assistant.modules.market_radar.models  # noqa: F401
    import invest_assistant.modules.portfolio.models  # noqa: F401
    import invest_assistant.modules.stock_analysis.models  # noqa: F401
    import invest_assistant.modules.track_discovery.models  # noqa: F401


def normalize_postgres_url(database_url: str) -> str:
    normalized = normalize_database_url(database_url)
    if not normalized.startswith("postgresql+psycopg://"):
        raise MigrationSafetyError("target database url must be a postgres/postgresql URL")
    return normalized


def sqlite_file_path(sqlite_url: str) -> Path:
    if not sqlite_url.startswith("sqlite:///"):
        raise MigrationSafetyError("sqlite source url must use sqlite:///path")
    raw_path = sqlite_url.replace("sqlite:///", "", 1)
    if raw_path == ":memory:":
        raise MigrationSafetyError("in-memory sqlite databases cannot be backed up")
    db_path = Path(raw_path)
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path
    return db_path


def default_backup_path(sqlite_url: str) -> Path:
    sqlite_path = sqlite_file_path(sqlite_url)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return sqlite_path.parent / "recovery" / f"{sqlite_path.name}.{timestamp}.bak"


def backup_sqlite_database(sqlite_url: str) -> Path:
    source_path = sqlite_file_path(sqlite_url)
    if not source_path.exists():
        raise MigrationSafetyError(f"sqlite source database does not exist: {source_path}")
    backup_path = default_backup_path(sqlite_url)
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, backup_path)
    return backup_path


def metadata_tables() -> list[Table]:
    import_all_models()
    return list(Base.metadata.sorted_tables)


def create_target_schema(engine: Engine) -> None:
    import_all_models()
    Base.metadata.create_all(bind=engine)

    from invest_assistant.modules.basic.job_center.models import ensure_job_center_schema
    from invest_assistant.modules.basic.stock_master.models import ensure_stock_master_schema
    from invest_assistant.modules.market_radar.models import ensure_market_radar_schema
    from invest_assistant.modules.track_discovery.models import ensure_track_discovery_schema

    ensure_job_center_schema(engine)
    ensure_stock_master_schema(engine)
    ensure_market_radar_schema(engine)
    ensure_track_discovery_schema(engine)


def _table_count(engine: Engine, table: Table) -> int:
    if not inspect(engine).has_table(table.name):
        return 0
    with engine.connect() as conn:
        return int(conn.scalar(select(func.count()).select_from(table)) or 0)


def check_target_empty(engine: Engine, tables: Sequence[Table]) -> None:
    for table in tables:
        row_count = _table_count(engine, table)
        if row_count > 0:
            raise MigrationSafetyError(f"target table {table.name} is not empty ({row_count} rows)")


def copy_table_rows(
    source_engine: Engine,
    target_engine: Engine,
    table: Table,
    batch_size: int,
    dry_run: bool,
) -> TableMigrationResult:
    if batch_size < 1:
        raise MigrationSafetyError("batch size must be greater than 0")
    if not inspect(source_engine).has_table(table.name):
        return TableMigrationResult(table.name, source_count=0, inserted_count=0, skipped_reason="source table missing")

    source_count = _table_count(source_engine, table)
    if dry_run or source_count == 0:
        return TableMigrationResult(table.name, source_count=source_count, inserted_count=0)

    inserted_count = 0
    batch: list[dict] = []
    with source_engine.connect() as source_conn, target_engine.begin() as target_conn:
        for row in source_conn.execute(select(table)).mappings():
            batch.append(dict(row))
            if len(batch) >= batch_size:
                target_conn.execute(insert(table), batch)
                inserted_count += len(batch)
                batch = []
        if batch:
            target_conn.execute(insert(table), batch)
            inserted_count += len(batch)

    return TableMigrationResult(table.name, source_count=source_count, inserted_count=inserted_count)


def reset_postgres_sequences(engine: Engine, tables: Sequence[Table]) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for table in tables:
            primary_keys = list(table.primary_key.columns)
            if len(primary_keys) != 1:
                continue
            primary_key = primary_keys[0]
            sequence_name = conn.scalar(
                text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
                {"table_name": table.name, "column_name": primary_key.name},
            )
            if not sequence_name:
                continue
            max_id = int(conn.scalar(select(func.max(primary_key)).select_from(table)) or 0)
            conn.execute(
                text("SELECT setval(CAST(:sequence_name AS regclass), :current_value, :is_called)"),
                {"sequence_name": sequence_name, "current_value": max(max_id, 1), "is_called": max_id > 0},
            )


def migrate_sqlite_to_postgres(
    sqlite_url: str,
    postgres_url: str,
    batch_size: int,
    dry_run: bool,
) -> tuple[list[TableMigrationResult], Path | None]:
    normalized_sqlite_url = normalize_database_url(sqlite_url)
    normalized_postgres_url = normalize_postgres_url(postgres_url)
    source_engine = create_engine(normalized_sqlite_url, **build_engine_options(normalized_sqlite_url))
    tables = metadata_tables()

    if dry_run:
        results = [
            copy_table_rows(source_engine, source_engine, table, batch_size=batch_size, dry_run=True)
            for table in tables
        ]
        return results, None

    backup_path = backup_sqlite_database(normalized_sqlite_url)
    target_engine = create_engine(normalized_postgres_url, **build_engine_options(normalized_postgres_url))
    create_target_schema(target_engine)
    check_target_empty(target_engine, tables)

    results = [
        copy_table_rows(source_engine, target_engine, table, batch_size=batch_size, dry_run=dry_run)
        for table in tables
    ]
    if not dry_run:
        reset_postgres_sequences(target_engine, tables)
    return results, backup_path


def print_summary(results: Sequence[TableMigrationResult], backup_path: Path | None, dry_run: bool) -> None:
    if dry_run:
        print("dry-run: no rows inserted")
    if backup_path is not None:
        print(f"sqlite backup: {backup_path}")
    for result in results:
        suffix = f", skipped={result.skipped_reason}" if result.skipped_reason else ""
        print(
            f"{result.table_name}: source={result.source_count}, "
            f"inserted={result.inserted_count}{suffix}"
        )


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate Liuli SQLite data into an empty PostgreSQL database.")
    parser.add_argument("--sqlite-url", default=DEFAULT_SQLITE_URL)
    parser.add_argument("--postgres-url", required=True)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        results, backup_path = migrate_sqlite_to_postgres(
            sqlite_url=args.sqlite_url,
            postgres_url=args.postgres_url,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
        )
    except MigrationSafetyError as exc:
        print(f"migration aborted: {exc}", file=sys.stderr)
        return 2
    print_summary(results, backup_path, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
