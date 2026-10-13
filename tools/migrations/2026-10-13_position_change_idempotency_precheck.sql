-- ============================================================================
-- 调仓幂等键与建议单次关联迁移前的只读预检。不修改任何数据，可以随时重复执行。
--
-- 目的：迁移会给 portfolio_position_change.advice_item_id 建部分唯一索引，
--       一条微操建议条目只能被一笔调仓关联。历史数据里同一条建议被关联多次时建索引会失败，
--       先用这份预检找出来，人工决定保留哪一笔、其余的 advice_item_id 置空。
--
--   psql "$LIULI_DATABASE_URL" -f 2026-10-13_position_change_idempotency_precheck.sql
-- ============================================================================

\echo '=== 1. 被关联多次的建议条目（必须为 0 行才能执行迁移）==='
SELECT advice_item_id, count(*) AS linked_count,
       string_agg(id::text, ',' ORDER BY id) AS change_ids
FROM portfolio_position_change
WHERE advice_item_id IS NOT NULL
GROUP BY advice_item_id
HAVING count(*) > 1
ORDER BY advice_item_id;

\echo '=== 2. 上一步有结果时看明细，保留第一笔，其余置空关联 ==='
SELECT c.id, c.portfolio_id, s.stock_name, c.change_date, c.quantity_delta, c.advice_item_id,
       c.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at_sh
FROM portfolio_position_change c
JOIN stock s ON s.id = c.stock_id
WHERE c.advice_item_id IN (
  SELECT advice_item_id FROM portfolio_position_change
  WHERE advice_item_id IS NOT NULL GROUP BY advice_item_id HAVING count(*) > 1
)
ORDER BY c.advice_item_id, c.id;

-- 只保留每条建议最早的那笔关联（确认明细后手工执行）：
-- UPDATE portfolio_position_change c SET advice_item_id = NULL
--  WHERE advice_item_id IS NOT NULL
--    AND id <> (SELECT min(id) FROM portfolio_position_change d WHERE d.advice_item_id = c.advice_item_id);
