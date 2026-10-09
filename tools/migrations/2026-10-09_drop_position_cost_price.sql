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
-- 执行顺序：必须先部署 1.0.1 代码并重启，再执行本脚本。
--   1.0.0 及更早的代码模型里还有 cost_price，查询持仓会 SELECT 这一列；
--   先删列再部署，旧代码所有持仓相关接口（含 workbench-today 今日大盘/组合）都会 500。
--   误删后的恢复：ALTER TABLE portfolio_position ADD COLUMN IF NOT EXISTS cost_price DOUBLE PRECISION;
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
