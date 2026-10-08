-- ============================================================================
-- 删除实盘持仓的 cost_price（成本价）列
--
-- 系统关心的是资源配置是否合理，不关心持仓的买入成本：cost_price 没有任何计算、
-- 页面或评估在用，只会经 MCP portfolio.get_overview 原样透出，误导外部研究员。
-- 2026-10-08 线上查询：portfolio_position 共 9 行，cost_price 非空 0 行，无需留档。
--
-- 适用：阿里云线上 PostgreSQL。
--       本地 SQLite 由 ensure_portfolio_schema 启动时自动删列（删之前先备份）。
--
-- 执行顺序不敏感：线上该列可空，代码已不读不写，重启前后执行都可以。
-- 安全性：只删这一列，不动其他数据。幂等，可重复执行。
--
-- 执行方式：
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-10-09_drop_position_cost_price.sql
-- ============================================================================

-- 执行前确认（期望第二列为 0）：
-- SELECT count(*), count(cost_price) FROM portfolio_position;

BEGIN;

ALTER TABLE portfolio_position DROP COLUMN IF EXISTS cost_price;

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检
-- ---------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'portfolio_position' AND column_name = 'cost_price';
--   期望 0 行
