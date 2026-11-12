"""Exercise the deployable SQL on a disposable local PostgreSQL database.

Set LIULI_TEST_POSTGRES_URL to a loopback database named liuli_profile_sql_test.
Each case creates a new schema and leaves it intact; no reset/drop/delete cleanup.
"""

import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict
import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / "tools/db/pgsql/20261112_portfolio_researchers.sql").read_text()
PROFILE = ROOT / "invest_assistant/modules/knowledge_base/external/researchers/portfolio_002/profile.md"
CUTOFF = "2026-11-12T00:00:00+08:00"


@pytest.fixture
def db():
    url = os.environ.get("LIULI_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("requires the isolated local PostgreSQL fixture")
    config = conninfo_to_dict(url)
    assert config.get("host") in {"127.0.0.1", "localhost"}
    assert config.get("dbname") == "liuli_profile_sql_test"
    with psycopg.connect(url, autocommit=True) as conn:
        schema = "profile_sql_" + uuid4().hex
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
        conn.execute("""
            CREATE TABLE knowledge_researcher (
                id serial PRIMARY KEY, researcher_code text UNIQUE NOT NULL, display_name text NOT NULL,
                profile_path text NOT NULL, profile_hash text, status text NOT NULL DEFAULT 'active',
                created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE knowledge_research_feedback (
                id integer PRIMARY KEY, title text NOT NULL, report_id integer, researcher_code text,
                created_at timestamptz NOT NULL, note text NOT NULL DEFAULT 'keep',
                CHECK (id <> 99 OR researcher_code IS NULL)
            );
            CREATE TABLE portfolio_adjust_advice (
                id integer PRIMARY KEY, feedback_id integer UNIQUE NOT NULL, report_id integer,
                researcher_code text, created_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'active',
                portfolio_id integer, target_trade_date date NOT NULL, note text NOT NULL DEFAULT 'keep'
            );
            CREATE TABLE portfolio_position_change (id integer PRIMARY KEY, quantity_delta integer, advice_item_id integer);
            INSERT INTO portfolio_position_change VALUES (1, 100, NULL);
            INSERT INTO knowledge_researcher (researcher_code, display_name, profile_path)
            VALUES ('portfolio_001', '组合微操大师', 'external/researchers/portfolio_001/profile.md');
        """)
        try:
            yield conn
        finally:
            # End a failed transaction without removing fixture data or schemas.
            if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
                conn.execute("ROLLBACK")


def add_pair(db, id=1, advice_code=None, feedback_code=None, status="active", portfolio_id=None):
    db.execute("""INSERT INTO knowledge_research_feedback
        (id, title, report_id, researcher_code, created_at)
        VALUES (%s, '实盘组合-2026-11-10-微操报告', %s, %s, '2026-11-10T12:00:00+08:00')""",
        (id, id, feedback_code))
    db.execute("""INSERT INTO portfolio_adjust_advice
        (id, feedback_id, report_id, researcher_code, created_at, status, portfolio_id, target_trade_date)
        VALUES (%s, %s, %s, %s, '2026-11-10T12:00:00+08:00', %s, %s, '2026-11-11')""",
        (id, id, id, advice_code, status, portfolio_id))


def run_script(db, apply=False, cutoff=CUTOFF):
    source = SCRIPT.replace("REPLACE_WITH_CUTOFF", cutoff)
    if apply:
        source = source.replace("do_apply boolean := false;", "do_apply boolean := true;")
    cursor = db.execute(source, prepare=False)
    result = None
    while True:
        if cursor.description and cursor.description[0].name == "result":
            result = json.loads(cursor.fetchone()[0])
        if not cursor.nextset():
            return result


def snapshot(db):
    tables = ["knowledge_researcher", "knowledge_research_feedback", "portfolio_adjust_advice", "portfolio_position_change"]
    return {table: db.execute(sql.SQL("SELECT to_jsonb(t) FROM {} t ORDER BY id").format(sql.Identifier(table))).fetchall()
            for table in tables}


def structure(db):
    return db.execute("""SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = current_schema()
        ORDER BY table_name, ordinal_position""").fetchall()


def test_preview_exports_before_rows_without_mutating_tables(db):
    add_pair(db, advice_code="  ", feedback_code="")
    before, schema = snapshot(db), structure(db)
    result = run_script(db)
    assert result["mode"] == "preview" and result["registered_count"] == 0
    assert result["planned_advice_count"] == result["planned_feedback_count"] == 1
    assert result["register_profile"]["researcher_code"] == "portfolio_002"
    assert result["updates"][0]["before"]["note"] == "keep"
    assert result["updates"][0]["old_code"] == "  "
    assert not result["conflicts"] and snapshot(db) == before and structure(db) == schema


def test_apply_is_atomic_and_idempotent_without_schema_or_trade_changes(db):
    add_pair(db)
    before, schema = snapshot(db), structure(db)
    result = run_script(db, apply=True)
    assert result["mode"] == "applied" and result["registered_count"] == 1
    assert result["updated_advice_count"] == result["updated_feedback_count"] == 1
    after = snapshot(db)
    for table in ("portfolio_adjust_advice", "knowledge_research_feedback"):
        assert after[table][0][0] == {**before[table][0][0], "researcher_code": "portfolio_001"}
    assert after["portfolio_position_change"] == before["portfolio_position_change"]
    assert structure(db) == schema
    registered = after["knowledge_researcher"][1][0]
    assert registered["profile_hash"] == hashlib.sha256(PROFILE.read_bytes()).hexdigest()
    assert registered["display_name"] == "组合趋势进攻师" and registered["status"] == "active"
    repeated = run_script(db, apply=True)
    assert repeated["updates"] == [] and repeated["registered_count"] == 0
    assert repeated["updated_advice_count"] == repeated["updated_feedback_count"] == 0
    assert snapshot(db) == after


@pytest.mark.parametrize("advice_code,feedback_code", [("portfolio_001", None), (None, "portfolio_001")])
def test_partial_identity_only_fills_the_missing_side(db, advice_code, feedback_code):
    add_pair(db, advice_code=advice_code, feedback_code=feedback_code)
    result = run_script(db, apply=True)
    assert result["updated_advice_count"] == int(advice_code is None)
    assert result["updated_feedback_count"] == int(feedback_code is None)
    assert db.execute("SELECT researcher_code FROM portfolio_adjust_advice").fetchone()[0] == "portfolio_001"
    assert db.execute("SELECT researcher_code FROM knowledge_research_feedback").fetchone()[0] == "portfolio_001"


def test_registration_works_when_legacy_identities_are_already_complete(db):
    add_pair(db, advice_code="portfolio_001", feedback_code="portfolio_001")
    before = snapshot(db)
    result = run_script(db, apply=True)
    assert result["registered_count"] == 1 and result["updates"] == []
    after = snapshot(db)
    for table in ("portfolio_adjust_advice", "knowledge_research_feedback", "portfolio_position_change"):
        assert after[table] == before[table]


def test_missing_legacy_researcher_stops_before_writing(db):
    db.execute("UPDATE knowledge_researcher SET researcher_code = 'unrelated'")
    add_pair(db)
    before = snapshot(db)
    with pytest.raises(psycopg.errors.RaiseException, match="不存在已确认的 portfolio_001"):
        run_script(db, apply=True)
    db.execute("ROLLBACK")
    assert snapshot(db) == before


@pytest.mark.parametrize("advice_code,feedback_code", [("another", None), (None, "another"), ("another", "another")])
def test_other_researchers_are_preserved(db, advice_code, feedback_code):
    add_pair(db, advice_code=advice_code, feedback_code=feedback_code)
    result = run_script(db, apply=True)
    assert result["updates"] == [] and result["skipped"]
    assert db.execute("SELECT researcher_code FROM portfolio_adjust_advice").fetchone()[0] == advice_code
    assert db.execute("SELECT researcher_code FROM knowledge_research_feedback").fetchone()[0] == feedback_code


@pytest.mark.parametrize("change", [
    "UPDATE portfolio_adjust_advice SET created_at = '2026-11-12T00:00:00+08:00'",
    "UPDATE knowledge_research_feedback SET created_at = '2026-11-12T00:00:00+08:00'",
    "UPDATE knowledge_research_feedback SET title = '标的-2026-11-10-估值报告'",
])
def test_only_linked_legacy_micro_reports_before_cutoff_are_updated(db, change):
    add_pair(db)
    db.execute(change)
    result = run_script(db, apply=True)
    assert result["updates"] == []
    assert db.execute("SELECT researcher_code FROM portfolio_adjust_advice").fetchone()[0] is None
    assert db.execute("SELECT researcher_code FROM knowledge_research_feedback").fetchone()[0] is None


def test_orphans_are_listed_for_manual_review(db):
    add_pair(db)
    db.execute("UPDATE portfolio_adjust_advice SET feedback_id = 999")
    result = run_script(db, apply=True)
    assert result["updates"] == [] and len(result["skipped"]) == 2


@pytest.mark.parametrize("case", ["identity", "report", "duplicate", "registration", "inactive"])
def test_conflicts_block_the_whole_transaction(db, case):
    add_pair(db)
    if case == "identity":
        db.execute("UPDATE portfolio_adjust_advice SET researcher_code = 'portfolio_001'")
        db.execute("UPDATE knowledge_research_feedback SET researcher_code = 'portfolio_002'")
    elif case == "report":
        db.execute("UPDATE knowledge_research_feedback SET report_id = 2")
    elif case == "duplicate":
        add_pair(db, id=2, advice_code="portfolio_001", feedback_code="portfolio_001")
    else:
        db.execute("""INSERT INTO knowledge_researcher (researcher_code, display_name, profile_path, status)
            VALUES ('portfolio_002', %s, 'external/researchers/portfolio_002/profile.md', %s)""",
            ("another" if case == "registration" else "组合趋势进攻师", "inactive" if case == "inactive" else "active"))
    before = snapshot(db)
    assert run_script(db)["conflicts"]
    with pytest.raises(psycopg.errors.RaiseException, match="存在归属冲突"):
        run_script(db, apply=True)
    db.execute("ROLLBACK")
    assert snapshot(db) == before


def test_a_write_failure_rolls_back_prior_registration_and_advice_updates(db):
    add_pair(db, id=99)
    before = snapshot(db)
    with pytest.raises(psycopg.errors.CheckViolation):
        run_script(db, apply=True)
    db.execute("ROLLBACK")
    assert snapshot(db) == before


@pytest.mark.parametrize("cutoff", ["REPLACE_WITH_CUTOFF", "2026-11-12T00:00:00"])
def test_missing_cutoff_or_timezone_is_rejected_before_writing(db, cutoff):
    before = snapshot(db)
    with pytest.raises(psycopg.errors.RaiseException, match="必须是带时区"):
        run_script(db, apply=True, cutoff=cutoff)
    db.execute("ROLLBACK")
    assert snapshot(db) == before


def test_superseded_history_and_distinct_portfolios_do_not_conflict(db):
    add_pair(db, id=1, status="superseded")
    add_pair(db, id=2, portfolio_id=1)
    add_pair(db, id=3, portfolio_id=2)
    result = run_script(db, apply=True)
    assert not result["conflicts"]
    assert result["updated_advice_count"] == result["updated_feedback_count"] == 3
