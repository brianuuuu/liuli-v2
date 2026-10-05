-- ============================================================================
-- 微操报告允许不绑定单个组合：portfolio_adjust_advice.portfolio_id 改为可空
--
-- 起因：微操研究员 portfolio_001 按所有账户合在一起的持仓出报告（调用 portfolio.get_overview
--       时不传 portfolio_id），报告里写不出单一组合 ID，导入一律报
--       “缺少字段: portfolio_id（存在多个组合时必须指定）”。改为可空后，空值表示全部实盘组合。
--
-- 适用：阿里云线上 PostgreSQL。表由 create_all 按旧模型建成 NOT NULL，create_all 不会改已有表，
--       所以需要手工执行本脚本。本地 SQLite 尚未建过该表，启动时直接按新模型建成可空，无需处理。
--
-- 安全性：只放宽一个非空约束，不删除、不改动任何数据。
-- 幂等：列已可空时 DROP NOT NULL 不报错，可重复执行。
--
-- 执行方式：
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-10-05_adjust_advice_portfolio_nullable.sql
-- ============================================================================

BEGIN;

ALTER TABLE portfolio_adjust_advice ALTER COLUMN portfolio_id DROP NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检
-- ---------------------------------------------------------------------------
-- SELECT is_nullable FROM information_schema.columns
--  WHERE table_name = 'portfolio_adjust_advice' AND column_name = 'portfolio_id';
--   期望 YES
