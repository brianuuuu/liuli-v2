-- PostgreSQL：已确认历史组合微操报告均由 portfolio_001 编写，仅补空身份。
-- 部署新 profile 文件并备份数据库后、启用 portfolio_002 前，在同一连接中整份执行。
-- 直接写入，无预览开关；不改表结构，已有非空身份保留。
BEGIN;

UPDATE portfolio_adjust_advice
SET researcher_code = 'portfolio_001'
WHERE NULLIF(btrim(researcher_code), '') IS NULL;

UPDATE knowledge_research_feedback
SET researcher_code = 'portfolio_001'
WHERE NULLIF(btrim(researcher_code), '') IS NULL
  AND (title LIKE '%-微操报告'
       OR id IN (SELECT feedback_id FROM portfolio_adjust_advice));

-- 注册新 profile；已存在则跳过。
INSERT INTO knowledge_researcher
    (researcher_code, display_name, profile_path, profile_hash, status, created_at, updated_at)
VALUES
    ('portfolio_002', '组合趋势进攻师', 'external/researchers/portfolio_002/profile.md',
     'cdb459e9559256797aeef1a60e96e91c887ac198f96284f560713f07c798b22e',
     'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (researcher_code) DO NOTHING;

COMMIT;
