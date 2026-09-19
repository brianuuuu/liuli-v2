-- ============================================================================
-- 赛道趋势快照重构：track_analysis_snapshot -> track_trend_snapshot
--
-- 适用：阿里云线上 PostgreSQL。在阿里云控制台或 psql 里整份执行。
-- 前提：track_analysis_snapshot 无数据（本地与线上均已确认为空），因此直接删表重建，
--       不做数据搬迁。执行前请照常做一次库级备份。
--
-- 幂等：全部语句带 IF EXISTS / IF NOT EXISTS，重复执行不报错。
-- 事务：整份包在一个事务里，任一句失败会整体回滚。
--
-- 执行方式：
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-09-19_track_trend_snapshot.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 删除旧快照表
-- ---------------------------------------------------------------------------
-- 执行前的安全阀：表里一旦有数据就主动报错中止，避免误删。
DO $$
DECLARE
    row_count bigint;
BEGIN
    IF to_regclass('public.track_analysis_snapshot') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM track_analysis_snapshot' INTO row_count;
        IF row_count > 0 THEN
            RAISE EXCEPTION
                'track_analysis_snapshot 有 % 行数据，本脚本假定该表为空，已中止。请先确认数据去向。',
                row_count;
        END IF;
    END IF;
END $$;

DROP TABLE IF EXISTS track_analysis_snapshot;

-- ---------------------------------------------------------------------------
-- 2. 新建 track_trend_snapshot
--    判断描述一律 TEXT，只有枚举码用 VARCHAR：stock_trend_snapshot 就是因为把判断
--    描述按 VARCHAR(50) 建，PostgreSQL 直接拒收整条快照，才回头加宽的。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS track_trend_snapshot (
    id                      SERIAL PRIMARY KEY,
    track_id                INTEGER     NOT NULL REFERENCES track(id),
    research_date           DATE        NOT NULL,
    researcher_code         VARCHAR(50),
    report_id               INTEGER     REFERENCES report(id),

    -- 卡片层：赛道卡上的"强 · 长期"直接读这两列
    headline_cycle          VARCHAR(16) NOT NULL,   -- short / mid / long
    headline_strength       VARCHAR(16) NOT NULL,   -- strong / medium / weak / insufficient
    core_judgment           TEXT,
    research_priority       VARCHAR(16),            -- priority / tracking / deprioritized
    priority_rank           INTEGER,                -- 未做同批排名时为 NULL
    confidence_level        VARCHAR(16),            -- low / medium / high

    -- 三周期判断
    short_strength          VARCHAR(16),
    short_direction         VARCHAR(16),            -- strengthening / stable / weakening
    short_basis             TEXT,
    mid_strength            VARCHAR(16),
    mid_direction           VARCHAR(16),
    mid_basis               TEXT,
    long_strength           VARCHAR(16),
    long_direction          VARCHAR(16),
    long_basis              TEXT,

    -- 六项核心分析
    demand_space            TEXT,
    supply_competition      TEXT,
    profit_cashflow         TEXT,
    policy_catalyst         TEXT,
    market_capital          TEXT,
    pricing_expectation_gap TEXT,

    key_contradiction       TEXT,
    -- [{segment, stance: benefiting|pressured, reason, constraint, representative_stocks: []}]
    segments_json           TEXT,

    industry_phase          VARCHAR(32),            -- intro / expansion / mature / contraction
    market_phase            VARCHAR(32),            -- latent / start / ferment / accelerate / climax / divergence / recede
    -- [{name: base|bull|bear, key_variable, trigger, path, window}]
    scenarios_json          TEXT,
    next_verification       TEXT,

    risk_falsification      TEXT,
    change_vs_last          TEXT,
    data_gaps               TEXT,
    -- [{type, source, as_of}]：各类数据的截止日期写在每条来源上
    data_sources_json       TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_track_id          ON track_trend_snapshot (track_id);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_research_date     ON track_trend_snapshot (research_date);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_report_id         ON track_trend_snapshot (report_id);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_research_priority ON track_trend_snapshot (research_priority);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_short_strength    ON track_trend_snapshot (short_strength);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_mid_strength      ON track_trend_snapshot (mid_strength);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_long_strength     ON track_trend_snapshot (long_strength);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_track_date        ON track_trend_snapshot (track_id, research_date);

-- ---------------------------------------------------------------------------
-- 3. track 主表：stage 拆成产业阶段 + 市场阶段，废弃 track_score，加最新快照指针
--    latest_snapshot_id 不建外键：track 和 track_trend_snapshot 互相引用，
--    加约束会让建表顺序和后续迁移都变复杂。
-- ---------------------------------------------------------------------------
-- 线上 track 表有数据，下面两列是要删的，删了找不回来。这里先挡一道：
-- track_score 有值、或 stage 出现映射表覆盖不到的取值，都中止，交给人确认。
-- 详细分布用 2026-09-19_track_trend_snapshot_precheck.sql 查。
DO $$
DECLARE
    scored_rows bigint;
    unmapped text;
BEGIN
    SELECT count(track_score) INTO scored_rows FROM track;
    IF scored_rows > 0 THEN
        RAISE EXCEPTION
            'track.track_score 有 % 行非空值，本脚本会直接删掉这一列，已中止。确认这些评分可以丢弃后再执行。',
            scored_rows;
    END IF;

    SELECT string_agg(DISTINCT stage, ', ') INTO unmapped
    FROM track
    WHERE stage IS NOT NULL
      AND stage NOT IN ('concept', 'validate', 'growth', 'overheat', 'decline');
    IF unmapped IS NOT NULL THEN
        RAISE EXCEPTION
            'track.stage 出现映射表覆盖不到的取值：%。继续执行会把它们静默丢成 NULL，已中止。',
            unmapped;
    END IF;
END $$;

ALTER TABLE track ADD COLUMN IF NOT EXISTS industry_phase     VARCHAR(32);
ALTER TABLE track ADD COLUMN IF NOT EXISTS market_phase       VARCHAR(32);
ALTER TABLE track ADD COLUMN IF NOT EXISTS latest_snapshot_id INTEGER;

-- 旧 stage 的取值混了产业阶段和市场阶段两种语义，按产业阶段迁移，
-- overheat 属于市场阶段语义，落到 market_phase 的 climax。
UPDATE track SET industry_phase = CASE stage
        WHEN 'concept'  THEN 'intro'
        WHEN 'validate' THEN 'intro'
        WHEN 'growth'   THEN 'expansion'
        WHEN 'overheat' THEN 'expansion'
        WHEN 'decline'  THEN 'contraction'
    END
WHERE stage IS NOT NULL AND industry_phase IS NULL;

UPDATE track SET market_phase = 'climax'
WHERE stage = 'overheat' AND market_phase IS NULL;

ALTER TABLE track DROP COLUMN IF EXISTS stage;
ALTER TABLE track DROP COLUMN IF EXISTS track_score;

CREATE INDEX IF NOT EXISTS ix_track_industry_phase ON track (industry_phase);
CREATE INDEX IF NOT EXISTS ix_track_market_phase   ON track (market_phase);

-- ---------------------------------------------------------------------------
-- 4. track_status_history：阶段变更也要分别留痕
-- ---------------------------------------------------------------------------
ALTER TABLE track_status_history ADD COLUMN IF NOT EXISTS old_industry_phase VARCHAR(32);
ALTER TABLE track_status_history ADD COLUMN IF NOT EXISTS new_industry_phase VARCHAR(32);
ALTER TABLE track_status_history ADD COLUMN IF NOT EXISTS old_market_phase   VARCHAR(32);
ALTER TABLE track_status_history ADD COLUMN IF NOT EXISTS new_market_phase   VARCHAR(32);

UPDATE track_status_history SET old_industry_phase = old_stage WHERE old_stage IS NOT NULL AND old_industry_phase IS NULL;
UPDATE track_status_history SET new_industry_phase = new_stage WHERE new_stage IS NOT NULL AND new_industry_phase IS NULL;

ALTER TABLE track_status_history DROP COLUMN IF EXISTS old_stage;
ALTER TABLE track_status_history DROP COLUMN IF EXISTS new_stage;

-- ---------------------------------------------------------------------------
-- 5. 赛道趋势研究员
--    没有这条记录，上传研究回流时 researcher_code 校验会直接拒绝，
--    「赛道趋势研究」类型的报告一份也导不进来。
--
--    profile_path 指向的是仓库里的文件（随代码部署），不是数据库内容：
--    invest_assistant/modules/knowledge_base/external/researchers/track_analyst_001/profile.md
--    profile_hash 留空，平台读取 profile 时会自行补算，不在这里写死。
-- ---------------------------------------------------------------------------
INSERT INTO knowledge_researcher (researcher_code, display_name, profile_path, status, created_at, updated_at)
VALUES (
    'track_analyst_001',
    '赛道趋势分析者',
    'external/researchers/track_analyst_001/profile.md',
    'active',
    now(),
    now()
)
ON CONFLICT ON CONSTRAINT uq_knowledge_researcher_code DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检：把下面三句单独跑一遍确认
-- ---------------------------------------------------------------------------
-- SELECT count(*) AS cols FROM information_schema.columns WHERE table_name = 'track_trend_snapshot';
--   期望 37
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'track' ORDER BY ordinal_position;
--   期望无 stage / track_score，有 industry_phase / market_phase / latest_snapshot_id
-- SELECT to_regclass('public.track_analysis_snapshot');
--   期望 NULL
