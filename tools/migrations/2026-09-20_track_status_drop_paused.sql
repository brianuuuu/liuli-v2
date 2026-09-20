-- ============================================================================
-- 赛道状态去掉 paused（暂停观察）
--
-- 适用：阿里云线上 PostgreSQL。DMS 一次只收一条语句，下面两句分开执行。
--
-- 状态收敛为三档：active 跟踪中 / candidate 候选 / archived 归档（软删除）。
-- 存量 paused 赛道统一改判为 candidate：它们曾经进过赛道库，退回候选还能被看到，
-- 落成 archived 等于软删除，会直接从默认列表里消失。
-- ============================================================================

-- 1. 先看一眼会改动多少条，以及都是哪些赛道
SELECT id, name, status, updated_at FROM track WHERE status = 'paused' ORDER BY updated_at DESC;

-- 2. 确认无误后执行改判
UPDATE track SET status = 'candidate', updated_at = now() WHERE status = 'paused';

-- ---------------------------------------------------------------------------
-- 执行后自检：
--   SELECT status, count(*) FROM track GROUP BY status ORDER BY count(*) DESC;
--   期望只剩 active / candidate / archived 三种取值
--
-- 备注：track.status 在后端没有做枚举校验（历来如此），页面只是不再提供
--       暂停观察这个选项。真要杜绝写入，得在 schemas 里加校验，但 TrackRead
--       继承同一个校验器，库里一旦有越界取值，列表接口会直接 500。
-- ---------------------------------------------------------------------------
