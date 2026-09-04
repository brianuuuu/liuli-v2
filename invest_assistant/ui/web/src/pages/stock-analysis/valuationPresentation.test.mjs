import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLatestValuationSummary,
  buildValuationComparisonOption,
  formatValuationGap,
  valuationModelLabel
} from "./valuationPresentation.ts";

test("valuation summary converts stored ratios into readable percentages", () => {
  assert.equal(formatValuationGap(0.5), "+50.00%");
  assert.equal(formatValuationGap(-0.11025), "-11.03%");
  assert.equal(formatValuationGap(null), "-");

  assert.equal(valuationModelLabel("revenue"), "营收模型");
  assert.equal(valuationModelLabel("profit"), "利润模型");
  assert.equal(valuationModelLabel("fcf"), "FCF 模型");
});

test("latest valuation summary exposes the decision-relevant fields", () => {
  assert.deepEqual(buildLatestValuationSummary({
    current_market_value: 76.28,
    expected_market_value_3y: 67.87,
    expectation_gap_rate: -0.11025,
    primary_model: "revenue",
    report_period: "2026-Q1",
    analysis_date: "2026-07-05",
    researcher: "valuator_001"
  }), {
    currentMarketValue: 76.28,
    expectedMarketValue3y: 67.87,
    gapText: "-11.03%",
    gapTone: "negative",
    modelLabel: "营收模型",
    reportPeriod: "2026-Q1",
    analysisDate: "2026-07-05",
    researcher: "valuator_001"
  });
});

test("valuation trend compares only current and three-year market values with narrow bars", () => {
  const option = buildValuationComparisonOption([
    { analysis_date: "2026-07-05", current_market_value: 76.28, expected_market_value_3y: 67.87 },
    { analysis_date: "2026-03-31", current_market_value: 65, expected_market_value_3y: 82 }
  ], "dark");

  assert.deepEqual(option.xAxis.data, ["2026-03-31", "2026-07-05"]);
  assert.equal(option.series.length, 2);
  assert.deepEqual(option.series.map((item) => item.name), ["当前市值", "三年合理市值"]);
  assert.ok(option.series.every((item) => item.type === "bar" && item.barMaxWidth === 34));
  assert.deepEqual(option.series[0].data, [65, 76.28]);
  assert.deepEqual(option.series[1].data, [82, 67.87]);
  assert.equal(Array.isArray(option.yAxis), false);
});
