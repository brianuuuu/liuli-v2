-- ============================================================================
-- 调仓记录增加调仓价格、理由来源和关联微操建议
--
-- portfolio_position_change 新增四列，全部可空，老记录保持为空：
--   price           调仓价格；手填为实际成交价，留空时按调仓日收盘价估算
--   price_source    manual（手填）/ estimated（按收盘价估算）；公司行为不估价，为空
--   reason_type     ai_advice / personal / fund_allocation / corporate_action / other
--   advice_item_id  关联的微操建议条目 portfolio_adjust_advice_item.id，只存 ID 不建外键
--
-- 适用：阿里云线上 PostgreSQL。create_all 不会给已有表加列，需要手工执行。
--       本地 SQLite 由 ensure_portfolio_schema 启动时自动补列（补之前先备份）。
--
-- 必须在重启服务前执行：模型已带这四列，不执行会导致调仓相关查询报错。
-- 安全性：只加列，不删除、不改动任何数据。幂等，可重复执行。
--
-- 执行方式：
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-10-08_position_change_price_reason.sql
-- ============================================================================

BEGIN;

ALTER TABLE portfolio_position_change ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION;
ALTER TABLE portfolio_position_change ADD COLUMN IF NOT EXISTS price_source VARCHAR(16);
ALTER TABLE portfolio_position_change ADD COLUMN IF NOT EXISTS reason_type VARCHAR(32);
ALTER TABLE portfolio_position_change ADD COLUMN IF NOT EXISTS advice_item_id INTEGER;

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检
-- ---------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'portfolio_position_change'
--    AND column_name IN ('price', 'price_source', 'reason_type', 'advice_item_id');
--   期望 4 行
