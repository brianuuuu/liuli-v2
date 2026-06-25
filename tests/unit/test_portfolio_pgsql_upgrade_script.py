from pathlib import Path


SCRIPT_PATH = Path("tools/db/pgsql/20260625_portfolio_cash_snapshot.sql")


def test_portfolio_pgsql_upgrade_script_is_idempotent_and_non_destructive():
    source = SCRIPT_PATH.read_text(encoding="utf-8").lower()

    assert "create table if not exists portfolio_cash_balance" in source
    assert "create table if not exists portfolio_cash_flow" in source
    assert "create table if not exists portfolio_value_snapshot" in source
    assert "unique (portfolio_id)" in source
    assert "unique (portfolio_id, snapshot_date)" in source
    assert "create index if not exists" in source
    assert "drop " not in source
    assert "truncate " not in source
    assert "delete " not in source
