BEGIN;

CREATE TABLE IF NOT EXISTS market_index_daily_bar (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(64) NOT NULL,
    trade_date DATE NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    pre_close DOUBLE PRECISION,
    change DOUBLE PRECISION,
    pct_chg DOUBLE PRECISION,
    vol DOUBLE PRECISION,
    amount DOUBLE PRECISION,
    source VARCHAR(32) NOT NULL DEFAULT 'tushare',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_market_index_daily_bar_code_date_source UNIQUE (code, trade_date, source)
);

CREATE INDEX IF NOT EXISTS ix_market_index_daily_bar_code
    ON market_index_daily_bar (code);

CREATE INDEX IF NOT EXISTS ix_market_index_daily_bar_trade_date
    ON market_index_daily_bar (trade_date);

CREATE INDEX IF NOT EXISTS ix_market_index_daily_bar_source
    ON market_index_daily_bar (source);

COMMIT;
