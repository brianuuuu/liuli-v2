-- 标的趋势快照：主线周期由 VARCHAR(20) 加宽为 TEXT。
-- 主线周期可包含阶段判断与验证条件，保留完整描述，不截断已有内容。
-- 执行前先备份数据库；本脚本只加宽列类型，不删除或清空数据。
-- PostgreSQL 启动兼容逻辑也会完成同一加宽，已是 TEXT 时跳过，可重复执行。

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'stock_trend_snapshot'
      AND column_name = 'mainline_cycle'
      AND character_maximum_length IS NOT NULL
  ) THEN
    ALTER TABLE stock_trend_snapshot ALTER COLUMN mainline_cycle TYPE TEXT;
  END IF;
END $$;

COMMIT;

-- 自检：data_type 应为 text，character_maximum_length 应为 NULL。
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'stock_trend_snapshot'
  AND column_name = 'mainline_cycle';
