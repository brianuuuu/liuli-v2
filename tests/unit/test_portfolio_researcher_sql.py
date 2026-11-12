"""Validate deployment SQL on a local PostgreSQL fixture; leave test data intact."""

import hashlib
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
TABLES = ("knowledge_researcher", "knowledge_research_feedback", "portfolio_adjust_advice", "portfolio_position_change")


def snapshot(db):
    return {table: [row[0] for row in db.execute(
        sql.SQL("SELECT to_jsonb(t) FROM {} t ORDER BY id").format(sql.Identifier(table))
    ).fetchall()] for table in TABLES}


def test_sql_backfills_legacy_reports_preserves_other_data_and_can_repeat():
    url = os.environ.get("LIULI_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("requires the isolated local PostgreSQL fixture")
    config = conninfo_to_dict(url)
    assert config.get("host") in {"127.0.0.1", "localhost"}
    assert config.get("dbname") == "liuli_profile_sql_test"
    with psycopg.connect(url, autocommit=True) as db:
        schema = sql.Identifier("profile_sql_" + uuid4().hex)
        db.execute(sql.SQL("CREATE SCHEMA {}").format(schema))
        db.execute(sql.SQL("SET search_path TO {}").format(schema))
        db.execute("""
            CREATE TABLE knowledge_researcher (
                id serial PRIMARY KEY, researcher_code text UNIQUE NOT NULL, display_name text NOT NULL,
                profile_path text NOT NULL, profile_hash text, status text NOT NULL,
                created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
            );
            CREATE TABLE knowledge_research_feedback (
                id integer PRIMARY KEY, title text NOT NULL, researcher_code text
            );
            CREATE TABLE portfolio_adjust_advice (
                id integer PRIMARY KEY, feedback_id integer UNIQUE NOT NULL, researcher_code text, status text NOT NULL
            );
            CREATE TABLE portfolio_position_change (id integer PRIMARY KEY, quantity_delta integer, advice_item_id integer);
            INSERT INTO portfolio_position_change VALUES (1, 100, NULL);
            INSERT INTO knowledge_researcher
                (researcher_code, display_name, profile_path, status, created_at, updated_at)
            VALUES ('portfolio_001', '组合微操大师', 'external/researchers/portfolio_001/profile.md', 'active', now(), now());
            INSERT INTO knowledge_research_feedback VALUES
                (1, '实盘组合-2026-11-10-微操报告', NULL),
                (2, '实盘组合-2026-11-09-微操报告', ''),
                (3, '重命名的历史报告', '  '),
                (4, '标的-2026-11-10-估值报告', NULL),
                (5, '实盘组合-2026-11-10-微操报告', 'portfolio_002'),
                (6, '实盘组合-2026-11-10-微操报告', 'portfolio_001');
            INSERT INTO portfolio_adjust_advice VALUES
                (1, 1, NULL, 'active'), (2, 3, '', 'superseded'),
                (3, 5, 'portfolio_002', 'active'), (4, 6, 'portfolio_001', 'active'),
                (5, 999, NULL, 'active');
        """)
        before = snapshot(db)
        db.execute(SCRIPT, prepare=False)
        after = snapshot(db)
        for table, changed in (("portfolio_adjust_advice", {1, 2, 5}), ("knowledge_research_feedback", {1, 2, 3})):
            assert after[table] == [
                {**row, "researcher_code": "portfolio_001"} if row["id"] in changed else row
                for row in before[table]
            ]
        assert after["portfolio_position_change"] == before["portfolio_position_change"]
        assert len(after["knowledge_researcher"]) == 2
        assert after["knowledge_researcher"][0] == before["knowledge_researcher"][0]
        registered = after["knowledge_researcher"][1]
        assert registered["researcher_code"] == "portfolio_002"
        assert registered["display_name"] == "组合趋势进攻师" and registered["status"] == "active"
        assert registered["profile_path"] == "external/researchers/portfolio_002/profile.md"
        assert registered["profile_hash"] == hashlib.sha256(PROFILE.read_bytes()).hexdigest()
        db.execute(SCRIPT, prepare=False)
        assert snapshot(db) == after
