-- ============================================================================
-- 微操报告增加大盘与整体仓位判断
--
-- portfolio_adjust_advice 新增六列，全部可空，老报告保持为空：
--   market_regime            大盘状态 uptrend / range / downtrend
--   market_risk              系统性风险 none / watch / warning / severe
--   target_stock_ratio_low   目标股票仓位区间下限（0—1）
--   target_stock_ratio_high  目标股票仓位区间上限（0—1）
--   position_direction       整体仓位方向 add / reduce / hold，事后按沪深300 收益评估
--   market_view_json         报告 JSON 的 market_view 原样保存，只用于展示
--
-- 适用：阿里云线上 PostgreSQL。create_all 不会给已有表加列，需要手工执行。
--       本地 SQLite 由 ensure_portfolio_schema 启动时自动补列（补之前先备份）。
--
-- 必须在重启服务前执行：模型已带这六列，不执行会导致微操报告导入、调仓复盘查询报错。
-- 安全性：只加列，不删除、不改动任何数据。幂等，可重复执行。
--
-- 执行方式：
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-10-24_adjust_advice_market_view.sql
-- ============================================================================

BEGIN;

ALTER TABLE portfolio_adjust_advice ADD COLUMN IF NOT EXISTS market_regime VARCHAR(16);
ALTER TABLE portfolio_adjust_advice ADD COLUMN IF NOT EXISTS market_risk VARCHAR(16);
ALTER TABLE portfolio_adjust_advice ADD COLUMN IF NOT EXISTS target_stock_ratio_low DOUBLE PRECISION;
ALTER TABLE portfolio_adjust_advice ADD COLUMN IF NOT EXISTS target_stock_ratio_high DOUBLE PRECISION;
ALTER TABLE portfolio_adjust_advice ADD COLUMN IF NOT EXISTS position_direction VARCHAR(8);
ALTER TABLE portfolio_adjust_advice ADD COLUMN IF NOT EXISTS market_view_json TEXT;

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检
-- ---------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'portfolio_adjust_advice'
--    AND column_name IN ('market_regime', 'market_risk', 'target_stock_ratio_low',
--                        'target_stock_ratio_high', 'position_direction', 'market_view_json');
--   期望 6 行
