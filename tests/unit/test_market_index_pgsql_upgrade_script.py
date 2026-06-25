from pathlib import Path


def test_market_index_realtime_quote_pgsql_upgrade_script_is_safe():
    sql = Path("tools/db/pgsql/20260625_market_index_realtime_quote.sql").read_text(encoding="utf-8").lower()

    assert "create table if not exists market_index_realtime_quote" in sql
    assert "create unique index if not exists" in sql
    assert "market_index_realtime_quote" in sql
    assert "drop " not in sql
    assert "truncate " not in sql
    assert "delete " not in sql
