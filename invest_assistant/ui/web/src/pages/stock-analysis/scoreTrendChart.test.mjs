import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SCORE_TREND_METRIC,
  SCORE_TREND_METRICS,
  buildScoreTrendBarOption
} from "./scoreTrendChart.ts";

const rows = [
  {
    report_time: "2026-08-31",
    total_score: 8.6,
    business_moat_score: 8.8,
    management_score: 7.6,
    governance_score: 8.1,
    strategy_score: 9.2,
    certainty_score: 8.4,
    growth_score: 9.1
  },
  {
    report_time: "2026-03-31",
    total_score: 7.9,
    business_moat_score: 8.2,
    management_score: 7.4,
    governance_score: 7.8,
    strategy_score: 8.5,
    certainty_score: 7.7,
    growth_score: 8.3
  }
];

test("score trend defaults to the total-score dimension", () => {
  assert.equal(DEFAULT_SCORE_TREND_METRIC, "total_score");
  assert.deepEqual(SCORE_TREND_METRICS.map((item) => item.label), [
    "总分",
    "壁垒",
    "管理",
    "治理",
    "战略",
    "确定性",
    "成长"
  ]);

  const option = buildScoreTrendBarOption(rows, DEFAULT_SCORE_TREND_METRIC);
  assert.deepEqual(option.xAxis.data, ["2026-03-31", "2026-08-31"]);
  assert.equal(option.series.length, 1);
  assert.equal(option.series[0].type, "bar");
  assert.equal(option.series[0].name, "总分");
  assert.deepEqual(option.series[0].data, [7.9, 8.6]);
});

test("score trend switches the single bar series to another dimension", () => {
  const option = buildScoreTrendBarOption(rows, "growth_score");
  assert.equal(option.series.length, 1);
  assert.equal(option.series[0].name, "成长");
  assert.deepEqual(option.series[0].data, [8.3, 9.1]);
});

test("score trend uses muted dashed split lines in dark mode", () => {
  const option = buildScoreTrendBarOption(rows, DEFAULT_SCORE_TREND_METRIC, "dark");
  assert.equal(option.yAxis.splitLine.lineStyle.type, "dashed");
  assert.equal(option.yAxis.splitLine.lineStyle.color, "rgba(148,163,184,0.14)");
  assert.equal(option.yAxis.axisLine.show, false);
  assert.equal(option.xAxis.axisTick.show, false);
});
