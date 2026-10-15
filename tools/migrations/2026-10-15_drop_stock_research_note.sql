-- ============================================================================
-- 删除 stock_research_note（标的研究笔记）表
--
-- 1.0.14 起标的笔记统一是 knowledge_note，经标签归属到标的，这张表不再有代码读写。
-- 2026-10-15 用户确认线上该表为空。
--
-- 适用：阿里云线上 PostgreSQL。本地 SQLite 留着这张空表也无影响，create_all 不会再建它。
--
-- 执行顺序：必须先部署 1.0.14 代码并重启，再执行本脚本。
--   1.0.13 及更早的代码模型里还有 StockResearchNote，标的详情会查询这张表；
--   先删表再部署，旧代码的标的详情、标的看板都会 500。
-- 安全性：表非空时直接报错中止，不删任何东西。幂等，可重复执行。
--
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-10-15_drop_stock_research_note.sql
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.stock_research_note') IS NOT NULL
     AND EXISTS (SELECT 1 FROM stock_research_note) THEN
    RAISE EXCEPTION 'stock_research_note 非空，已中止。先导出并确认这些行如何处理。';
  END IF;
END $$;

DROP TABLE IF EXISTS stock_research_note;

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检（期望 NULL）
-- ---------------------------------------------------------------------------
-- SELECT to_regclass('public.stock_research_note');
