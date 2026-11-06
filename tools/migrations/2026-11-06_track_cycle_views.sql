-- PostgreSQL：赛道快照支持独立周期判断及无评分研究。
-- 仅新增两列、放宽九列非空约束；保留全部历史行、索引和关联。
-- 本文件仅供部署时显式执行，不在启动路径自动运行。
-- 执行前停止写入并备份 PostgreSQL；同时按项目要求保留
-- var/db/liuli.sqlite3 到 var/db/recovery/ 的备份（本地文件存在时）。
-- psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f tools/migrations/2026-11-06_track_cycle_views.sql
-- SQLite 请使用同目录 2026-11-06_track_cycle_views_sqlite.py；本 SQL 不适用于 SQLite。

BEGIN;

ALTER TABLE track_trend_snapshot
    ADD COLUMN IF NOT EXISTS cycle_views_json TEXT,
    ADD COLUMN IF NOT EXISTS next_verification_date DATE,
    ALTER COLUMN market_heat_score DROP NOT NULL,
    ALTER COLUMN growth_speed_score DROP NOT NULL,
    ALTER COLUMN concentration_score DROP NOT NULL,
    ALTER COLUMN cycle_resilience_score DROP NOT NULL,
    ALTER COLUMN current_market_size_score DROP NOT NULL,
    ALTER COLUMN future_market_size_score DROP NOT NULL,
    ALTER COLUMN overall_score DROP NOT NULL,
    ALTER COLUMN track_grade DROP NOT NULL,
    ALTER COLUMN heat_tier DROP NOT NULL;

COMMIT;

-- 可重复执行。以下查询应返回十一列，is_nullable 均为 YES。
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'track_trend_snapshot'
  AND column_name IN (
    'cycle_views_json', 'next_verification_date',
    'market_heat_score', 'growth_speed_score', 'concentration_score',
    'cycle_resilience_score', 'current_market_size_score', 'future_market_size_score',
    'overall_score', 'track_grade', 'heat_tier'
  )
ORDER BY column_name;
