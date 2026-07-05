-- Stock score snapshot minimal-schema full rebuild for SQLite.
-- Date: 2026-07-05

PRAGMA foreign_keys = OFF;

BEGIN;

DROP TABLE IF EXISTS stock_score_snapshot;

CREATE TABLE stock_score_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL REFERENCES stock(id),
    report_time DATE NOT NULL,
    researcher_code VARCHAR(64),
    business_moat_score FLOAT NOT NULL DEFAULT 0,
    management_score FLOAT NOT NULL DEFAULT 0,
    governance_score FLOAT NOT NULL DEFAULT 0,
    strategy_score FLOAT NOT NULL DEFAULT 0,
    certainty_score FLOAT NOT NULL DEFAULT 0,
    growth_score FLOAT NOT NULL DEFAULT 0,
    total_score FLOAT NOT NULL DEFAULT 0,
    investment_level VARCHAR(32),
    core_logic TEXT,
    primary_risk TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_stock_score_snapshot_stock_id
    ON stock_score_snapshot (stock_id);

CREATE INDEX IF NOT EXISTS ix_stock_score_snapshot_report_time
    ON stock_score_snapshot (report_time);

CREATE INDEX IF NOT EXISTS ix_stock_score_snapshot_researcher_code
    ON stock_score_snapshot (researcher_code);

COMMIT;

PRAGMA foreign_keys = ON;
