-- ============================================================================
-- 六维评分迁移前的只读预检。不修改任何数据，可以随时重复执行。
--
-- 目的：迁移会重建 track_trend_snapshot，整表清空并删掉 13 列研究结论字段
--       （headline_strength、research_priority、priority_rank、confidence_level、
--         三周期的 strength / direction / basis 共 9 列），换成六维评分。
--       线上现存的是测试数据、已确认可丢弃，这份预检只用来执行前看一眼将被删掉的内容。
--
--   psql "$LIULI_DATABASE_URL" -f 2026-09-20_track_score_dimensions_precheck.sql
-- ============================================================================

\echo '=== 1. 快照总量（这些行都会被迁移删掉）==='
SELECT count(*) AS snapshot_rows FROM track_trend_snapshot;

\echo '=== 2. 待删列里有多少非空值 ==='
SELECT count(headline_strength) AS headline_strength,
       count(research_priority) AS research_priority,
       count(priority_rank)     AS priority_rank,
       count(confidence_level)  AS confidence_level,
       count(short_strength)    AS short_strength,
       count(mid_strength)      AS mid_strength,
       count(long_strength)     AS long_strength,
       count(short_basis)       AS short_basis,
       count(mid_basis)         AS mid_basis,
       count(long_basis)        AS long_basis
FROM track_trend_snapshot;

\echo '=== 3. 快照明细（第 1 步不为 0 时看这里，确认确实都是测试数据）==='
SELECT s.id, t.name AS track_name, s.research_date, s.researcher_code,
       s.headline_cycle, s.headline_strength, s.research_priority, s.confidence_level
FROM track_trend_snapshot s
LEFT JOIN track t ON t.id = s.track_id
ORDER BY s.research_date DESC, s.id DESC;

\echo '=== 4. track 上的最新快照指针（重建后会被一并清空，需要重新导入研究报告）==='
SELECT count(*) AS track_rows, count(latest_snapshot_id) AS rows_with_pointer FROM track;

-- ---------------------------------------------------------------------------
-- 怎么看结果：
--   第 3 步的明细里都是测试数据 -> 直接跑 2026-09-20_track_score_dimensions.sql
--   出现了想保留的真实研究结论 -> 停下。这批快照没有六维评分，迁移不做搬迁，
--                                 重建就是丢掉，先导出留档再决定。
--   迁移后                     -> 赛道卡的评级和 T 级角标要等新报告导入才会出现，
--                                 这是预期行为，不是数据丢失。
-- ---------------------------------------------------------------------------
