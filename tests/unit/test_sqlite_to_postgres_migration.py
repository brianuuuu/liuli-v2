from pathlib import Path

import pytest
from sqlalchemy import MetaData, Table, Column, Integer, String, create_engine, insert, text

from tools.dev import migrate_sqlite_to_postgres as migration


def make_table() -> Table:
    metadata = MetaData()
    return Table(
        "sample_item",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("name", String(64), nullable=False),
    )


def test_default_sqlite_backup_path_uses_recovery_directory(tmp_path):
    sqlite_path = tmp_path / "liuli.sqlite3"
    sqlite_path.write_text("sqlite-data", encoding="utf-8")

    backup_path = migration.default_backup_path(f"sqlite:///{sqlite_path.as_posix()}")

    assert backup_path.parent == sqlite_path.parent / "recovery"
    assert backup_path.name.startswith("liuli.sqlite3.")
    assert backup_path.suffix == ".bak"


def test_check_target_empty_aborts_when_any_target_table_has_rows():
    table = make_table()
    engine = create_engine("sqlite:///:memory:")
    table.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(insert(table), [{"id": 1, "name": "exists"}])

    with pytest.raises(migration.MigrationSafetyError, match="target table sample_item is not empty"):
        migration.check_target_empty(engine, [table])


def test_copy_table_rows_dry_run_does_not_insert_into_target():
    table = make_table()
    source = create_engine("sqlite:///:memory:")
    target = create_engine("sqlite:///:memory:")
    table.metadata.create_all(bind=source)
    table.metadata.create_all(bind=target)
    with source.begin() as conn:
        conn.execute(insert(table), [{"id": 1, "name": "one"}, {"id": 2, "name": "two"}])

    result = migration.copy_table_rows(source, target, table, batch_size=1, dry_run=True)

    assert result == migration.TableMigrationResult(table_name="sample_item", source_count=2, inserted_count=0)
    with target.connect() as conn:
        assert conn.scalar(text("SELECT COUNT(*) FROM sample_item")) == 0


def test_migrate_dry_run_does_not_connect_to_or_modify_postgres(tmp_path, monkeypatch):
    table = make_table()
    sqlite_path = tmp_path / "source.sqlite3"
    source_url = f"sqlite:///{sqlite_path.as_posix()}"
    source_engine = create_engine(source_url)
    table.metadata.create_all(bind=source_engine)
    with source_engine.begin() as conn:
        conn.execute(insert(table), [{"id": 1, "name": "one"}])

    def fake_create_engine(database_url, **options):  # noqa: ANN001
        if database_url.startswith("postgresql"):
            raise AssertionError("dry-run must not create a postgres engine")
        return create_engine(database_url, **options)

    monkeypatch.setattr(migration, "metadata_tables", lambda: [table])
    monkeypatch.setattr(migration, "create_engine", fake_create_engine)

    results, backup_path = migration.migrate_sqlite_to_postgres(
        sqlite_url=source_url,
        postgres_url="postgresql://liuli:secret@localhost/liuli",
        batch_size=100,
        dry_run=True,
    )

    assert backup_path is None
    assert results == [migration.TableMigrationResult(table_name="sample_item", source_count=1, inserted_count=0)]


def test_rejects_non_postgres_target_url_for_cli_safety():
    with pytest.raises(migration.MigrationSafetyError, match="postgres"):
        migration.normalize_postgres_url("sqlite:///:memory:")
