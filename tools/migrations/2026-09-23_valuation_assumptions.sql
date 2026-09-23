-- 估值假设：研究员支撑本次估值的 1-3 个可量化指标，外加对上一期假设的兑现验证。
--
-- 选填字段：老快照和没填的执行都是 NULL，导入侧不做必填校验，展示端据此决定要不要渲染。
-- 存整段 JSON 文本，和同表的 financial_performance_json / profit_model_json 一致，不拆新表。
--
-- 结构：
--   {
--     "previous_period": "2025-Q4",
--     "last_assumptions_vs_actual": [{"metric": "...", "assumed": "...", "actual": "...", "result": "不如预期"}],
--     "current_assumptions": [{"metric": "...", "assumed": "..."}]
--   }
--
-- 幂等，可重复执行。

ALTER TABLE stock_valuation_snapshot
    ADD COLUMN IF NOT EXISTS valuation_assumptions_json TEXT;
