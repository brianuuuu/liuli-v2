-- ============================================================================
-- 1.0.14 笔记移出材料表
--
-- 笔记与材料并列：笔记经标签实时归属到标的和赛道，不再作为 track_material / stock_material 的一种类型。
--   - stock_material 的 knowledge_note 行指向的是 stock_research_note（表为空），直接删除；
--   - track_material 的 knowledge_note 行指向真正的知识笔记：先给笔记补上赛道主标签
--     （同名标签优先，否则最早绑定的 active 标签），保证仍归属该赛道，再删除材料行。
--
-- 适用：阿里云线上 PostgreSQL。
-- 执行顺序：先跑 2026-10-15_notes_by_tag_precheck.sql 看清数据，
--   再在部署 1.0.14 代码之前执行本脚本。旧代码不依赖这些行，提前删除安全；
--   新代码的材料类型校验不认 knowledge_note，部署后再删会让含这些行的赛道详情报错。
-- 安全性：只删 material_type = 'knowledge_note' 的引用行，笔记本身不动。幂等，可重复执行。
--
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-10-15_notes_detach_from_materials.sql
-- ============================================================================

BEGIN;

INSERT INTO knowledge_note_tag_relation (note_id, tag_id, created_at)
SELECT DISTINCT ON (m.material_id, m.track_id) m.material_id, tg.id, now()
FROM track_material m
JOIN track t ON t.id = m.track_id
JOIN knowledge_note n ON n.id = m.material_id
JOIN track_tag_relation tr ON tr.track_id = m.track_id AND tr.status = 'active'
JOIN tag tg ON tg.id = tr.tag_id AND tg.status = 'active'
WHERE m.material_type = 'knowledge_note'
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_note_tag_relation r
    JOIN track_tag_relation tr2 ON tr2.tag_id = r.tag_id AND tr2.track_id = m.track_id AND tr2.status = 'active'
    WHERE r.note_id = m.material_id
  )
ORDER BY m.material_id, m.track_id, (tg.name = t.name) DESC, tr.id
ON CONFLICT (note_id, tag_id) DO NOTHING;

DELETE FROM track_material WHERE material_type = 'knowledge_note';
DELETE FROM stock_material WHERE material_type = 'knowledge_note';

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检（两行都期望 0）
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM track_material WHERE material_type = 'knowledge_note';
-- SELECT count(*) FROM stock_material WHERE material_type = 'knowledge_note';
