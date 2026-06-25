BEGIN;

CREATE TABLE IF NOT EXISTS portfolio_cash_balance (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER NOT NULL REFERENCES portfolio(id),
    amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (portfolio_id)
);

CREATE INDEX IF NOT EXISTS ix_portfolio_cash_balance_portfolio_id
    ON portfolio_cash_balance (portfolio_id);

CREATE TABLE IF NOT EXISTS portfolio_cash_flow (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER NOT NULL REFERENCES portfolio(id),
    flow_type VARCHAR(32) NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
    flow_date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_portfolio_cash_flow_portfolio_id
    ON portfolio_cash_flow (portfolio_id);

CREATE INDEX IF NOT EXISTS ix_portfolio_cash_flow_flow_date
    ON portfolio_cash_flow (flow_date);

CREATE TABLE IF NOT EXISTS portfolio_value_snapshot (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER NOT NULL REFERENCES portfolio(id),
    snapshot_date DATE NOT NULL,
    total_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_market_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    cash_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    day_pnl DOUBLE PRECISION,
    day_pct DOUBLE PRECISION,
    position_count INTEGER NOT NULL DEFAULT 0,
    source VARCHAR(32) NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (portfolio_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS ix_portfolio_value_snapshot_portfolio_id
    ON portfolio_value_snapshot (portfolio_id);

CREATE INDEX IF NOT EXISTS ix_portfolio_value_snapshot_snapshot_date
    ON portfolio_value_snapshot (snapshot_date);

COMMIT;
