import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

function transpile(name) {
  const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  }).outputText;
}

const dir = mkdtempSync(join(tmpdir(), "liuli-trend-"));
writeFileSync(join(dir, "stockChartPalette.mjs"), transpile("stockChartPalette"));
const compiledPath = join(dir, "trendPresentation.mjs");
// 源码里用的是显式 .ts 后缀，转译后要指回同目录的编译产物
writeFileSync(compiledPath, transpile("trendPresentation").replace("./stockChartPalette.ts", "./stockChartPalette.mjs"));

const {
  TREND_LEVELS,
  buildLatestTrendSummary,
  buildTrendDimensions,
  buildTrendLevelTimelineOption,
  suggestedGroupLabel,
  trendLevelTone
} = await import(pathToFileURL(compiledPath));

assert.deepEqual(TREND_LEVELS, ["T0", "T1", "T2", "T3", "T4", "T5"]);

assert.equal(trendLevelTone("T0"), "strong");
assert.equal(trendLevelTone("T1"), "strong");
assert.equal(trendLevelTone("T2"), "medium");
assert.equal(trendLevelTone("T3"), "weak");
assert.equal(trendLevelTone("T5"), "weak");
assert.equal(trendLevelTone(null), "weak", "an unknown level must not be rendered as strong");

assert.equal(suggestedGroupLabel("focused"), "重点");
assert.equal(suggestedGroupLabel("candidate"), "候选");
assert.equal(suggestedGroupLabel("watching"), "观察");
assert.equal(suggestedGroupLabel("archived"), "归档");
assert.equal(suggestedGroupLabel(null), "-");

const dimensions = buildTrendDimensions({
  track_short: "中",
  track_mid: "中",
  track_long: "强",
  company_position: "核心受益",
  market_recognition: "品牌出海有辨识度，AI 家庭生态叙事发酵；尚未证明成为全市场主线核心",
  capital_recognition: "9月3日放量启动后缩量回踩，9月11日成交量约20日均量的七成",
  stock_stage: "修复"
});
assert.equal(dimensions.length, 6, "six dimensions, with the three track horizons merged into one row");
assert.deepEqual(
  dimensions.map((item) => item.label),
  ["赛道趋势", "公司地位", "市场认可", "资金认可", "日线位置", "主线周期"]
);
assert.equal(dimensions[0].value, "中 / 中 / 强", "track horizons render as one short row");
assert.equal(
  dimensions[2].value,
  "品牌出海有辨识度，AI 家庭生态叙事发酵；尚未证明成为全市场主线核心",
  "recognition judgements are full sentences and must be returned untruncated"
);
assert.equal(dimensions[5].value, "-", "a missing dimension must render as a dash, not undefined");
assert.equal(
  buildTrendDimensions({}).map((item) => item.value).join(""),
  "------",
  "an empty snapshot must not produce a row of slashes"
);

const summary = buildLatestTrendSummary({
  trend_level: "T2",
  stock_stage: "修复",
  main_track: "消费电子",
  suggested_group: "candidate",
  priority_rank: null,
  research_date: "2026-09-11",
  market_data_date: "2026-09-10",
  researcher_code: "trend_001"
});
assert.equal(summary.levelTone, "medium");
assert.equal(summary.suggestedGroup, "候选");
assert.equal(summary.priorityRank, null, "an un-ranked report must stay null rather than becoming 0");

const option = buildTrendLevelTimelineOption(
  [
    { research_date: "2026-09-11", trend_level: "T2" },
    { research_date: "2026-07-05", trend_level: "T3" },
    { research_date: "2026-08-01", trend_level: "bad" }
  ],
  "light"
);
assert.deepEqual(option.xAxis.data, ["2026-07-05", "2026-09-11"], "timeline must sort by date and drop invalid levels");
assert.deepEqual(option.series[0].data, [3, 2]);
assert.equal(option.yAxis.inverse, true, "T0 is the strongest level so the axis must be inverted");

console.log("trendPresentation tests passed");
