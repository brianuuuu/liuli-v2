-- ============================================================================
-- 1.0.14 笔记改为经标签归属前的只读预检。不修改任何数据，可以随时重复执行。
--
-- 1.0.14 起笔记与材料并列：笔记不再进 track_material / stock_material，
-- 而是经标签实时归属到标的和赛道；stock_research_note 表删除。
-- 先看清三件事，再执行 2026-10-15_notes_detach_from_materials.sql 和 2026-10-15_drop_stock_research_note.sql。
--
--   psql "$LIULI_DATABASE_URL" -f 2026-10-15_notes_by_tag_precheck.sql
-- ============================================================================

\echo '=== 1. stock_research_note 行数（期望 0，非 0 时删表脚本会中止）==='
SELECT count(*) AS stock_research_note_rows FROM stock_research_note;

\echo '=== 2. stock_material 里的 knowledge_note 行（指向的是 stock_research_note，表空时应为 0）==='
SELECT id, stock_id, material_id, status, created_at
FROM stock_material
WHERE material_type = 'knowledge_note'
ORDER BY id;

\echo '=== 3. track_material 里的 knowledge_note 行，以及笔记是否已带该赛道的标签 ==='
-- already_tagged = false 的行，清理脚本会先给笔记补上赛道主标签，保证删掉材料行后笔记仍归属该赛道
SELECT m.id AS material_row_id, m.track_id, t.name AS track_name, m.material_id AS note_id, n.title AS note_title,
       n.status AS note_status,
       EXISTS (
         SELECT 1 FROM knowledge_note_tag_relation r
         JOIN track_tag_relation tr ON tr.tag_id = r.tag_id AND tr.track_id = m.track_id AND tr.status = 'active'
         WHERE r.note_id = m.material_id
       ) AS already_tagged
FROM track_material m
JOIN track t ON t.id = m.track_id
LEFT JOIN knowledge_note n ON n.id = m.material_id
WHERE m.material_type = 'knowledge_note'
ORDER BY m.track_id, m.id;

\echo '=== 4. 第 3 步需要补标签时用的赛道主标签（同名标签优先，否则最早绑定的 active 标签）==='
SELECT DISTINCT ON (m.track_id) m.track_id, t.name AS track_name, tg.id AS tag_id, tg.name AS tag_name
FROM track_material m
JOIN track t ON t.id = m.track_id
JOIN track_tag_relation tr ON tr.track_id = m.track_id AND tr.status = 'active'
JOIN tag tg ON tg.id = tr.tag_id AND tg.status = 'active'
WHERE m.material_type = 'knowledge_note'
ORDER BY m.track_id, (tg.name = t.name) DESC, tr.id;
