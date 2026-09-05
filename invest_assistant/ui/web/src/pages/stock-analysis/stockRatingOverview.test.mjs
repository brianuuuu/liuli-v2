import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLatestRatingOverview,
  buildLatestRatingRadarOption
} from "./stockRatingOverview.ts";

const latestScore = {
  id: 17,
  stock_id: 42,
  report_time: "2026-08-31",
  researcher_code: "researcher-a",
  business_moat_score: 8.8,
  management_score: 7.6,
  governance_score: 8.1,
  strategy_score: 9.2,
  certainty_score: 8.4,
  growth_score: 9.1,
  total_score: 8.66,
  investment_level: "A",
  core_logic: "创新药国际化进入兑现期",
  primary_risk: "研发失败和商业化不及预期"
};

test("buildLatestRatingOverview exposes the latest six-dimension rating profile", () => {
  assert.deepEqual(buildLatestRatingOverview(latestScore), {
    totalScore: 8.66,
    investmentLevel: "A",
    researcherCode: "researcher-a",
    reportTime: "2026-08-31",
    coreLogic: "创新药国际化进入兑现期",
    primaryRisk: "研发失败和商业化不及预期",
    dimensions: [
      { name: "壁垒", value: 8.8 },
      { name: "管理", value: 7.6 },
      { name: "治理", value: 8.1 },
      { name: "战略", value: 9.2 },
      { name: "确定性", value: 8.4 },
      { name: "成长", value: 9.1 }
    ]
  });
});

test("buildLatestRatingOverview returns null without a rating snapshot", () => {
  assert.equal(buildLatestRatingOverview(null), null);
  assert.equal(buildLatestRatingOverview(undefined), null);
});

test("buildLatestRatingRadarOption uses a ten-point scale and the profile values", () => {
  const overview = buildLatestRatingOverview(latestScore);
  assert.ok(overview);

  const option = buildLatestRatingRadarOption(overview, "dark");
  assert.deepEqual(option.radar.indicator, [
    { name: "壁垒", max: 10 },
    { name: "管理", max: 10 },
    { name: "治理", max: 10 },
    { name: "战略", max: 10 },
    { name: "确定性", max: 10 },
    { name: "成长", max: 10 }
  ]);
  assert.deepEqual(option.series[0].data[0].value, [8.8, 7.6, 8.1, 9.2, 8.4, 9.1]);
  assert.equal(option.radar.axisName.color, "#aab2bf");
  assert.equal(option.radar.splitLine.lineStyle.color, "#2b333e");
  assert.equal(option.radar.axisLine.lineStyle.color, "#2b333e");
  assert.equal(option.series[0].lineStyle.color, "#60a5fa");
  assert.equal(option.series[0].itemStyle.color, "#60a5fa");
});
