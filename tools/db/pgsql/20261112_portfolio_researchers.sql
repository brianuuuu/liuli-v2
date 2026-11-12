-- PostgreSQL：注册 portfolio_002，补齐历史微操报告及关联回流的空研究员身份。
-- 不改变表结构，不修改个人调仓、建议关联或原始报告文件。
-- 先部署包含 portfolio_002/profile.md 的代码；正式执行前通过数据库控制台完成备份。
-- 只需修改下方 cutoff_text；默认 do_apply=false 预览，确认结果后改 true 再完整执行。
-- 两次使用同一截止时点（带时区，排除此时点及之后的数据），勿晚于新 profile 启用时间。
-- 导出保存 result 中的变更前记录；它是审计清单，不代替数据库备份。
-- 在同一连接中整份执行，勿只选中 UPDATE/INSERT；报错后执行 ROLLBACK 结束失败事务再重试。

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'Asia/Shanghai';

DO $portfolio_researchers$
DECLARE
    cutoff_text text := 'REPLACE_WITH_CUTOFF'; -- 例如 2026-11-12T18:00:00+08:00，按实际上线时间填写。
    do_apply boolean := false;
    cutoff timestamptz;
    old_code constant text := 'portfolio_001'; -- 已由线上 MCP 确认。
    new_code constant text := 'portfolio_002';
    new_name constant text := '组合趋势进攻师';
    new_path constant text := 'external/researchers/portfolio_002/profile.md';
    new_hash constant text := 'cdb459e9559256797aeef1a60e96e91c887ac198f96284f560713f07c798b22e';
    existing record;
    row_data record;
    a_code text;
    f_code text;
    advice_ids integer[] := ARRAY[]::integer[];
    feedback_ids integer[] := ARRAY[]::integer[];
    updates jsonb := '[]'::jsonb;
    conflicts jsonb := '[]'::jsonb;
    skipped jsonb := '[]'::jsonb;
    registration jsonb := NULL;
    advice_count integer := 0;
    feedback_count integer := 0;
    registered_count integer := 0;
    result jsonb;
BEGIN
    IF cutoff_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
        RAISE EXCEPTION '请先设置 cutoff_text，必须是带时区的启用前截止时间，例如 2026-11-12T18:00:00+08:00';
    END IF;
    cutoff := cutoff_text::timestamptz;

    IF do_apply THEN
        LOCK TABLE knowledge_researcher, knowledge_research_feedback, portfolio_adjust_advice
            IN SHARE ROW EXCLUSIVE MODE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM knowledge_researcher WHERE researcher_code = old_code) THEN
        RAISE EXCEPTION '目标数据库中不存在已确认的 portfolio_001，停止';
    END IF;
    SELECT * INTO existing FROM knowledge_researcher WHERE researcher_code = new_code;
    IF FOUND THEN
        IF existing.display_name IS DISTINCT FROM new_name OR existing.profile_path IS DISTINCT FROM new_path
            OR existing.status IS DISTINCT FROM 'active' THEN
            conflicts := conflicts || jsonb_build_object('researcher_code', new_code,
                'reason', 'portfolio_002 的名称、路径或状态不符合预期，保留原值，请人工核对');
        END IF;
    ELSE
        registration := jsonb_build_object('researcher_code', new_code, 'display_name', new_name,
            'profile_path', new_path, 'profile_hash', new_hash, 'status', 'active');
    END IF;

    FOR row_data IN
        SELECT a.id AS advice_id, a.researcher_code AS advice_code,
            f.id AS feedback_id, f.researcher_code AS feedback_code, f.title, f.created_at AS feedback_created_at,
            a.report_id IS DISTINCT FROM f.report_id AS report_mismatch,
            to_jsonb(a) AS advice_before, to_jsonb(f) AS feedback_before
        FROM portfolio_adjust_advice a
        LEFT JOIN knowledge_research_feedback f ON f.id = a.feedback_id
        WHERE a.created_at < cutoff
        ORDER BY a.id
    LOOP
        a_code := NULLIF(btrim(row_data.advice_code), '');
        f_code := NULLIF(btrim(row_data.feedback_code), '');
        IF row_data.feedback_id IS NULL THEN
            IF a_code IS NULL THEN
                skipped := skipped || jsonb_build_object('advice_id', row_data.advice_id,
                    'reason', '关联回流不存在，需人工核对');
            END IF;
            CONTINUE;
        END IF;
        IF a_code IS NOT NULL AND f_code IS NOT NULL AND a_code <> f_code THEN
            conflicts := conflicts || jsonb_build_object('advice_id', row_data.advice_id,
                'feedback_id', row_data.feedback_id, 'reason', '研究员编号冲突');
            CONTINUE;
        END IF;
        IF a_code <> old_code OR f_code <> old_code THEN
            skipped := skipped || jsonb_build_object('advice_id', row_data.advice_id,
                'reason', '属于其他研究员，保留原值');
            CONTINUE;
        END IF;
        IF row_data.feedback_created_at >= cutoff
            OR row_data.title !~ '^.+-[0-9]{4}-[0-9]{2}-[0-9]{2}-微操报告$' THEN
            skipped := skipped || jsonb_build_object('advice_id', row_data.advice_id,
                'reason', '关联回流不在历史微操范围');
            CONTINUE;
        END IF;
        IF row_data.report_mismatch THEN
            conflicts := conflicts || jsonb_build_object('advice_id', row_data.advice_id,
                'reason', '报告关联不一致');
            CONTINUE;
        END IF;
        IF a_code IS NULL THEN
            advice_ids := array_append(advice_ids, row_data.advice_id);
            updates := updates || jsonb_build_object('table', 'portfolio_adjust_advice', 'id', row_data.advice_id,
                'old_code', row_data.advice_code, 'new_code', old_code, 'before', row_data.advice_before);
        END IF;
        IF f_code IS NULL THEN
            feedback_ids := array_append(feedback_ids, row_data.feedback_id);
            updates := updates || jsonb_build_object('table', 'knowledge_research_feedback', 'id', row_data.feedback_id,
                'old_code', row_data.feedback_code, 'new_code', old_code, 'before', row_data.feedback_before);
        END IF;
    END LOOP;

    FOR row_data IN
        SELECT array_agg(a.id ORDER BY a.id) AS ids
        FROM portfolio_adjust_advice a
        WHERE a.status = 'active'
        GROUP BY a.portfolio_id, a.target_trade_date,
            CASE WHEN a.id = ANY(advice_ids) THEN old_code ELSE NULLIF(btrim(a.researcher_code), '') END
        HAVING count(*) > 1 AND bool_or(a.id = ANY(advice_ids))
    LOOP
        conflicts := conflicts || jsonb_build_object('advice_ids', row_data.ids,
            'reason', '补齐后产生同组合、研究员、适用日的多份有效报告');
    END LOOP;

    FOR row_data IN
        SELECT f.id FROM knowledge_research_feedback f
        WHERE f.created_at < cutoff AND NULLIF(btrim(f.researcher_code), '') IS NULL
            AND f.title LIKE '%-微操报告'
            AND NOT EXISTS (SELECT 1 FROM portfolio_adjust_advice a WHERE a.feedback_id = f.id)
        ORDER BY f.id
    LOOP
        skipped := skipped || jsonb_build_object('feedback_id', row_data.id,
            'reason', '尚无关联微操记录，需核对原报告');
    END LOOP;

    IF do_apply THEN
        IF jsonb_array_length(conflicts) > 0 THEN
            RAISE EXCEPTION '存在归属冲突，未执行修改；请先预览核对'
                USING DETAIL = conflicts::text;
        END IF;
        IF registration IS NOT NULL THEN
            INSERT INTO knowledge_researcher
                (researcher_code, display_name, profile_path, profile_hash, status, created_at, updated_at)
            VALUES (new_code, new_name, new_path, new_hash, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            registered_count := 1;
        END IF;
        UPDATE portfolio_adjust_advice SET researcher_code = old_code
        WHERE id = ANY(advice_ids) AND NULLIF(btrim(researcher_code), '') IS NULL;
        GET DIAGNOSTICS advice_count = ROW_COUNT;
        UPDATE knowledge_research_feedback SET researcher_code = old_code
        WHERE id = ANY(feedback_ids) AND NULLIF(btrim(researcher_code), '') IS NULL;
        GET DIAGNOSTICS feedback_count = ROW_COUNT;
        IF advice_count <> cardinality(advice_ids) OR feedback_count <> cardinality(feedback_ids) THEN
            RAISE EXCEPTION '更新数量与计划不一致，整笔事务回滚';
        END IF;
    END IF;

    result := jsonb_build_object('mode', CASE WHEN do_apply THEN 'applied' ELSE 'preview' END,
        'database', current_database(), 'schema', current_schema(), 'before', cutoff,
        'planned_advice_count', cardinality(advice_ids), 'planned_feedback_count', cardinality(feedback_ids),
        'updated_advice_count', advice_count, 'updated_feedback_count', feedback_count,
        'registered_count', registered_count, 'register_profile', registration,
        'updates', updates, 'conflicts', conflicts, 'skipped', skipped);
    PERFORM set_config('liuli.portfolio_researcher_result', result::text, true);
END;
$portfolio_researchers$;

-- 导出保存这一行，包含计划、变更前记录、冲突和跳过原因。
SELECT jsonb_pretty(current_setting('liuli.portfolio_researcher_result')::jsonb) AS result;

-- 预览时显示原数据；正式执行时应有两个研究员，既有非空身份仍保留。
SELECT researcher_code, display_name, profile_path, profile_hash, status
FROM knowledge_researcher WHERE researcher_code IN ('portfolio_001', 'portfolio_002') ORDER BY researcher_code;

SELECT 'portfolio_adjust_advice' AS table_name, researcher_code, count(*) AS row_count
FROM portfolio_adjust_advice GROUP BY researcher_code
UNION ALL
SELECT 'knowledge_research_feedback', researcher_code, count(*)
FROM knowledge_research_feedback WHERE title LIKE '%-微操报告' GROUP BY researcher_code
ORDER BY table_name, researcher_code NULLS FIRST;

COMMIT;
