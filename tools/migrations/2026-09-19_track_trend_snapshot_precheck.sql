-- ============================================================================
-- 线上迁移前的只读预检。不修改任何数据，可以随时重复执行。
--
-- 目的：迁移会 DROP 掉 track.stage 和 track.track_score。线上 track 表有数据，
--       所以必须先确认这两列里没有需要保留的内容，否则删掉就找不回来了。
--
--   psql "$LIULI_DATABASE_URL" -f 2026-09-19_track_trend_snapshot_precheck.sql
-- ============================================================================

\echo '=== 1. 赛道总量 ==='
SELECT count(*) AS track_rows FROM track;

\echo '=== 2. stage 取值分布（迁移会按语义映射到 industry_phase / market_phase）==='
SELECT COALESCE(stage, '(NULL)') AS stage, count(*) AS rows
FROM track GROUP BY stage ORDER BY count(*) DESC;

\echo '=== 3. stage 里是否有映射表覆盖不到的取值（有则迁移会静默丢失）==='
SELECT DISTINCT stage AS unmapped_stage
FROM track
WHERE stage IS NOT NULL
  AND stage NOT IN ('concept', 'validate', 'growth', 'overheat', 'decline');

\echo '=== 4. track_score 是否有值（迁移会直接删掉这一列）==='
SELECT count(*) AS total_rows,
       count(track_score) AS rows_with_score,
       min(track_score) AS min_score,
       max(track_score) AS max_score
FROM track;

\echo '=== 5. 有评分的赛道明细（上一步 rows_with_score > 0 时才有输出）==='
SELECT id, name, status, stage, track_score
FROM track WHERE track_score IS NOT NULL ORDER BY track_score DESC;

\echo '=== 6. 旧快照表行数（迁移脚本要求为 0，否则会中止）==='
SELECT count(*) AS track_analysis_snapshot_rows FROM track_analysis_snapshot;

\echo '=== 7. track_status_history 的 stage 留痕 ==='
SELECT count(*) AS history_rows,
       count(old_stage) AS rows_with_old_stage,
       count(new_stage) AS rows_with_new_stage
FROM track_status_history;

-- ---------------------------------------------------------------------------
-- 怎么看结果：
--   第 3 步有输出   -> 停下，先告诉我这些取值该映射到哪里，别直接跑迁移
--   第 4 步 rows_with_score > 0 -> 停下，这些评分删了就没了，先决定要不要留
--   第 6 步 不为 0  -> 停下，迁移脚本本身也会中止
--   以上都干净      -> 直接跑 2026-09-19_track_trend_snapshot.sql
-- ---------------------------------------------------------------------------
