-- ============================================================================
-- 调仓记录增加幂等键，微操建议条目只能关联一次
--
-- portfolio_position_change：
--   client_request_id  新增可空列。客户端每次确认调仓生成一个，网络中断后重试沿用同一个值，
--                      服务端按它只记一次。老记录为空。
--   uq_portfolio_position_change_client_request  client_request_id 非空时唯一
--   uq_portfolio_position_change_advice_item     advice_item_id 非空时唯一：报告里的一个标的只对应一笔调仓
--
-- 清仓改为软删除（portfolio_position.status = 'closed'、quantity = 0），status 列已存在，无结构变更。
--
-- 适用：阿里云线上 PostgreSQL。create_all 不会给已有表加列和索引，需要手工执行。
--       本地 SQLite 由 ensure_portfolio_schema 启动时自动补列、建索引。
--
-- 执行前先跑 2026-10-13_position_change_idempotency_precheck.sql，第 1 步必须为 0 行，
-- 否则唯一索引建不上，整个事务回滚。
-- 必须在重启服务前执行：模型已带 client_request_id，不执行会导致调仓相关查询报错。
-- 安全性：只加列和索引，不删除、不改动任何数据。幂等，可重复执行。
--
-- 执行方式：
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-10-13_position_change_idempotency.sql
-- ============================================================================

BEGIN;

ALTER TABLE portfolio_position_change ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_position_change_client_request
    ON portfolio_position_change (client_request_id) WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_position_change_advice_item
    ON portfolio_position_change (advice_item_id) WHERE advice_item_id IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检
-- ---------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'portfolio_position_change' AND column_name = 'client_request_id';
--   期望 1 行
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'portfolio_position_change' AND indexname LIKE 'uq_portfolio_position_change_%';
--   期望 2 行
