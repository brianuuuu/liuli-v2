-- Widen stock_trend_snapshot recognition columns from VARCHAR(50) to TEXT.
-- Date: 2026-09-12
-- 市场/资金认可度是带证据的判断描述，真实趋势报告普遍写到 60~110 字，
-- VARCHAR(50) 会让 PostgreSQL 拒绝整条快照（SQLite 不校验长度，本地试不出来）。
-- varchar -> text 是加宽，不丢数据；重复执行安全（已是 text 的列会被跳过）。
BEGIN;

DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['market_recognition', 'capital_recognition'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'stock_trend_snapshot'
        AND column_name = col
        AND character_maximum_length IS NOT NULL
    ) THEN
      EXECUTE format('ALTER TABLE stock_trend_snapshot ALTER COLUMN %I TYPE TEXT', col);
      RAISE NOTICE 'widened %', col;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- 核对：两行的 data_type 应为 text，character_maximum_length 应为 NULL
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'stock_trend_snapshot'
  AND column_name IN ('market_recognition', 'capital_recognition')
ORDER BY column_name;
