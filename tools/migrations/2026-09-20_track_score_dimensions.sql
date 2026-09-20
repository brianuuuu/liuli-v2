-- ============================================================================
-- 赛道快照量化改造：track_trend_snapshot 的强/中/弱结论换成六维 0—10 评分
--
-- 适用：阿里云线上 PostgreSQL。在阿里云控制台或 psql 里整份执行。
--
-- 【本脚本会清空 track_trend_snapshot】线上现存的是测试数据，已确认可以丢弃，
-- 所以直接重建整表，不做数据搬迁：旧快照没有六维评分，六个评分列又是 NOT NULL，
-- 补不出真实分数。执行前可用 precheck 看一眼将被删掉的行，或照常做一次库级备份。
--
-- 幂等：全部语句带 IF EXISTS / IF NOT EXISTS，重复执行不报错。
-- 事务：整份包在一个事务里，任一句失败会整体回滚。
--
-- 执行方式：
--   psql "$LIULI_DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-09-20_track_score_dimensions.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 删除旧快照表
--    存量行是测试数据，直接丢弃。这里只把删掉的行数打进执行日志，方便事后对账；
--    整份脚本在一个事务里，后面任何一句失败都会连这次删除一起回滚。
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    row_count bigint;
BEGIN
    IF to_regclass('public.track_trend_snapshot') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM track_trend_snapshot' INTO row_count;
        RAISE NOTICE 'track_trend_snapshot 将被重建，丢弃 % 行测试数据。', row_count;
    END IF;
END $$;

DROP TABLE IF EXISTS track_trend_snapshot;

-- ---------------------------------------------------------------------------
-- 2. 重建 track_trend_snapshot
--
--    结论层从"强/中/弱 + 主导周期"换成六维评分：六个 0—10 分，外加派生的综合分、
--    评级和热度档位。派生三列由后端 scoring.py 在入库时算好写入，不接受外部传值；
--    冗余存一份是为了看板按评级筛选排序走 SQL，不必把全部快照捞进内存再算。
--
--    六维一律"分高 = 更有利"，否则算术平均没有意义。两个容易读反的维度：
--      cycle_resilience_score  10 = 弱周期、能穿越周期，0 = 强周期、大起大落
--      concentration_score     10 = 格局收敛、龙头有定价权，0 = 高度分散内卷
--
--    判断描述一律 TEXT，只有枚举码用 VARCHAR：stock_trend_snapshot 就是因为把判断
--    描述按 VARCHAR(50) 建，PostgreSQL 直接拒收整条快照，才回头加宽的。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS track_trend_snapshot (
    id                        SERIAL PRIMARY KEY,
    track_id                  INTEGER     NOT NULL REFERENCES track(id),
    research_date             DATE        NOT NULL,
    researcher_code           VARCHAR(50),
    report_id                 INTEGER     REFERENCES report(id),

    -- 六维评分，全部 0—10
    market_heat_score         DOUBLE PRECISION NOT NULL,  -- 市场热度
    growth_speed_score        DOUBLE PRECISION NOT NULL,  -- 发展速度
    concentration_score       DOUBLE PRECISION NOT NULL,  -- 行业集中度
    cycle_resilience_score    DOUBLE PRECISION NOT NULL,  -- 周期韧性（10 = 弱周期）
    current_market_size_score DOUBLE PRECISION NOT NULL,  -- 当前市场规模
    future_market_size_score  DOUBLE PRECISION NOT NULL,  -- 远期市场规模

    -- 派生三项：六项平均、综合分评级、市场热度档位
    overall_score             DOUBLE PRECISION NOT NULL,
    track_grade               VARCHAR(2)  NOT NULL,       -- S / A / B / C / D
    heat_tier                 VARCHAR(4)  NOT NULL,       -- T0 最热 … T4 最冷

    -- 卡片副标题：本次判断站在哪个时间尺度。强度已由评级承接。
    headline_cycle            VARCHAR(16) NOT NULL,       -- short / mid / long
    core_judgment             TEXT,

    -- 六项核心分析
    demand_space              TEXT,
    supply_competition        TEXT,
    profit_cashflow           TEXT,
    policy_catalyst           TEXT,
    market_capital            TEXT,
    pricing_expectation_gap   TEXT,

    key_contradiction         TEXT,
    -- [{segment, stance: benefiting|pressured, reason, constraint, representative_stocks: []}]
    segments_json             TEXT,

    industry_phase            VARCHAR(32),                -- intro / expansion / mature / contraction
    market_phase              VARCHAR(32),                -- latent / start / ferment / accelerate / climax / divergence / recede
    -- [{name: base|bull|bear, key_variable, trigger, path, window}]
    scenarios_json            TEXT,
    next_verification         TEXT,

    risk_falsification        TEXT,
    change_vs_last            TEXT,
    data_gaps                 TEXT,
    -- [{type, source, as_of}]：各类数据的截止日期写在每条来源上
    data_sources_json         TEXT,

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_track_id      ON track_trend_snapshot (track_id);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_research_date ON track_trend_snapshot (research_date);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_report_id     ON track_trend_snapshot (report_id);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_overall_score ON track_trend_snapshot (overall_score);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_track_grade   ON track_trend_snapshot (track_grade);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_heat_tier     ON track_trend_snapshot (heat_tier);
CREATE INDEX IF NOT EXISTS ix_track_trend_snapshot_track_date    ON track_trend_snapshot (track_id, research_date);

-- ---------------------------------------------------------------------------
-- 3. track 的最新快照指针指向已删除的旧行，一并清空
--    重建后赛道卡会显示"待研究"，直到新的研究报告导入——这是预期行为。
-- ---------------------------------------------------------------------------
UPDATE track SET latest_snapshot_id = NULL WHERE latest_snapshot_id IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- 执行后自检：把下面三句单独跑一遍确认
-- ---------------------------------------------------------------------------
-- SELECT count(*) AS cols FROM information_schema.columns WHERE table_name = 'track_trend_snapshot';
--   期望 33
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'track_trend_snapshot' AND column_name LIKE '%score%' ORDER BY column_name;
--   期望 7 行：六个维度分 + overall_score
-- SELECT count(latest_snapshot_id) AS dangling FROM track;
--   期望 0
