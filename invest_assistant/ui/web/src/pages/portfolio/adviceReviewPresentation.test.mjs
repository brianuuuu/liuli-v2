import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const output = ts.transpileModule(readFileSync(new URL("./adviceReviewPresentation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { buildAdviceReviewGroups, directionEffect, riskExcess } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

const item = (id, overrides = {}) => ({
  id, stock_id: 1, stock_code: "002352", stock_name: "顺丰控股", action: "reduce",
  primary_signal_code: "cash_rebalance", risk_level: "none", trigger_status: "touched",
  execution_status: "not_executed", return_20d: 0.0199, verdict: "wrong", ...overrides
});
const report = (id, items, overrides = {}) => ({
  id, portfolio_id: null, researcher_code: "portfolio_001", target_trade_date: `2026-10-${String(id).padStart(2, "0")}`,
  data_as_of_date: "2026-09-30", items, ...overrides
});
const data = (reports, overrides = {}) => ({
  reports, summary: { report_count: reports.length },
  signal_stats: { by_signal: [{ action: "reduce", signal_code: "cash_rebalance", samples: 1, correct: 0, wrong: 1, neutral: 0, win_rate: 0, avg_effect_20d: -0.0199 }], by_category: [] },
  risk_stats: [], ...overrides
});

test("不同研究员的同股同向建议分别计样本，各自的连续重复仍去重", () => {
  const source = data([
    report(1, [item(1)]),
    report(2, [item(2)], { researcher_code: "portfolio_002" }),
    report(3, [item(3)]),
    report(4, [item(4)], { researcher_code: "portfolio_002" })
  ]);
  const rows = buildAdviceReviewGroups(source, "signal").groups[0].records;
  const byId = Object.fromEntries(rows.map((row) => [row.item.id, row.inclusion]));
  assert.deepEqual(byId, { 1: "counted", 2: "counted", 3: "repeat", 4: "repeat" });
});

test("连续未执行建议只标记一个统计样本，保留每次理由并保持后台汇总", () => {
  const source = data([report(2, [item(2)]), report(1, [item(1)])]);
  const before = JSON.stringify(source);
  const result = buildAdviceReviewGroups(source, "signal");
  assert.equal(result.complete, true);
  assert.equal(result.groups[0].samples, 1);
  assert.deepEqual(result.groups[0].records.map((row) => row.inclusion), ["repeat", "counted"]);
  assert.equal(result.groups[0].avgEffect, -0.0199);
  assert.equal(JSON.stringify(source), before);
});

test("不同组合与已经部分执行后的同方向建议独立计入", () => {
  const source = data([
    report(1, [item(1, { execution_status: "partial" })], { portfolio_id: 1 }),
    report(2, [item(2)], { portfolio_id: 1 }),
    report(3, [item(3)], { portfolio_id: 2 })
  ]);
  assert.deepEqual(buildAdviceReviewGroups(source, "signal").groups[0].records.map((row) => row.inclusion), ["counted", "counted", "counted"]);
});

test("尚无成熟样本的类别也显示，未触价与待评估不冒充错误", () => {
  const source = data([report(1, [item(1, { verdict: null, return_20d: null }), item(2, { primary_signal_code: "concentration_risk", trigger_status: "not_touched" })])], {
    signal_stats: { by_signal: [], by_category: [] }
  });
  const groups = buildAdviceReviewGroups(source, "signal").groups;
  assert.equal(groups.find((row) => row.code === "cash_rebalance").pending, 1);
  assert.equal(groups.find((row) => row.code === "cash_rebalance").samples, 0);
  assert.equal(groups.find((row) => row.code === "concentration_risk").records[0].inclusion, "not_touched");
});

test("截断历史不推断样本归属，不以近期记录覆盖全量汇总", () => {
  const source = data([report(2, [item(2)])]);
  source.summary.report_count = 201;
  source.signal_stats.by_signal[0].samples = 87;
  const result = buildAdviceReviewGroups(source, "signal");
  assert.equal(result.complete, false);
  assert.equal(result.groups[0].samples, 87);
  assert.equal(result.groups[0].records[0].inclusion, "unknown");
});

test("等待持仓的警示照常评估，后续降级与旧命中结果分别保留", () => {
  const warning = item(1, { action: "wait", risk_level: "warning", primary_risk_code: "relative_weakness", verdict: null, risk_verdict: "miss" });
  const source = data([
    report(1, [warning]),
    report(2, [item(2, { action: "wait", risk_level: "watch", primary_risk_code: "fundamental_deterioration", risk_verdict: null })])
  ], { risk_stats: [{ risk_code: "relative_weakness", samples: 1, hits: 0, hit_rate: 0 }] });
  const group = buildAdviceReviewGroups(source, "risk").groups[0];
  assert.equal(group.records.length, 1);
  assert.equal(group.hits, 0);
  assert.equal(group.records[0].item.risk_verdict, "miss");
  assert.deepEqual(group.records[0].latestRisk, { date: "2026-10-02", level: "watch" });
});

test("全量统计存在但近期无相关记录时保留分类；空数据不生成假样本", () => {
  const source = data([]);
  source.summary.report_count = 300;
  assert.equal(buildAdviceReviewGroups(source, "signal").groups[0].records.length, 0);
  assert.equal(buildAdviceReviewGroups(source, "signal").groups[0].samples, 1);
  assert.deepEqual(buildAdviceReviewGroups(data([], { signal_stats: { by_signal: [] } }), "signal").groups, []);
});

test("方向效果与超额收益正确处理减持、零和缺失值", () => {
  assert.equal(directionEffect(item(1)), -0.0199);
  assert.equal(directionEffect(item(1, { action: "add", return_20d: 0 })), 0);
  assert.equal(directionEffect(item(1, { return_20d: null })), null);
  assert.equal(riskExcess(item(1, { return_20d: -0.02, benchmark_return_20d: 0.02 })), -0.04);
  assert.equal(riskExcess(item(1)), null);
});
