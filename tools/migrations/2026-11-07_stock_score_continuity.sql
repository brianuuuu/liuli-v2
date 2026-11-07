-- Back up PostgreSQL and the local SQLite database before applying.
BEGIN;
ALTER TABLE stock_score_snapshot
    ADD COLUMN IF NOT EXISTS report_id INTEGER,
    ADD COLUMN IF NOT EXISTS previous_snapshot_id INTEGER,
    ADD COLUMN IF NOT EXISTS continuity_json TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_score_snapshot_report_id
    ON stock_score_snapshot (report_id);
COMMIT;
