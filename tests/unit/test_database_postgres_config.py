from sqlalchemy import create_engine

from invest_assistant.bootstrap import database


def test_normalize_database_url_keeps_sqlite_default():
    assert database.normalize_database_url("sqlite:///./var/db/liuli.sqlite3") == "sqlite:///./var/db/liuli.sqlite3"


def test_normalize_database_url_uses_psycopg_for_postgres_urls():
    assert (
        database.normalize_database_url("postgresql://liuli:secret@localhost:5432/liuli")
        == "postgresql+psycopg://liuli:secret@localhost:5432/liuli"
    )
    assert (
        database.normalize_database_url("postgres://liuli:secret@localhost:5432/liuli")
        == "postgresql+psycopg://liuli:secret@localhost:5432/liuli"
    )


def test_build_engine_options_are_dialect_specific():
    sqlite_options = database.build_engine_options("sqlite:///:memory:")
    postgres_options = database.build_engine_options("postgresql+psycopg://liuli:secret@localhost/liuli")

    assert sqlite_options == {"connect_args": {"check_same_thread": False}, "pool_pre_ping": True}
    assert postgres_options == {"pool_pre_ping": True}


def test_configured_sqlite_engine_can_be_created_with_options():
    engine = create_engine("sqlite:///:memory:", **database.build_engine_options("sqlite:///:memory:"))

    assert engine.dialect.name == "sqlite"
