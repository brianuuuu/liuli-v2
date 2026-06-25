BEGIN;

CREATE TABLE IF NOT EXISTS market_index_realtime_quote (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(64) NOT NULL,
    price DOUBLE PRECISION,
    change DOUBLE PRECISION,
    pct_chg DOUBLE PRECISION,
    quote_time TIMESTAMPTZ,
    source VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'unknown',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_market_index_realtime_quote_code UNIQUE (code)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_market_index_realtime_quote_code
    ON market_index_realtime_quote (code);

CREATE INDEX IF NOT EXISTS ix_market_index_realtime_quote_quote_time
    ON market_index_realtime_quote (quote_time);

CREATE INDEX IF NOT EXISTS ix_market_index_realtime_quote_status
    ON market_index_realtime_quote (status);

COMMIT;
