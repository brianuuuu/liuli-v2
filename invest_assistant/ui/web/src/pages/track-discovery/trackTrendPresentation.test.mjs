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

const dir = mkdtempSync(join(tmpdir(), "liuli-track-trend-"));
const compiledPath = join(dir, "trackTrendPresentation.mjs");
writeFileSync(compiledPath, transpile("trackTrendPresentation"));

const {
  TRACK_SCORE_DIMENSIONS,
  buildAnalysisCells,
  buildScoreCells,
  buildScoreRadarOption,
  buildScoreTimelineOption,
  buildSnapshotSummary,
  buildCycleCells,
  scoreSourceText,
  verificationStatus,
  hasResearchContent,
  orderScenarios,
  parseDataSources,
  snapshotCycleViews,
  splitSegments
} = await import(pathToFileURL(compiledPath).href);

/** 六维齐全的快照，各用例只覆盖自己关心的字段。 */
function snapshot(overrides = {}) {
  return {
    research_date: "2026-07-05",
    headline_cycle: "long",
    market_heat_score: 8.5,
    growth_speed_score: 9,
    concentration_score: 8,
    cycle_resilience_score: 6.5,
    current_market_size_score: 7.5,
    future_market_size_score: 9,
    overall_score: 8.08,
    track_grade: "S",
    heat_tier: "T1",
    ...overrides
  };
}

const palette = { text: "#333", grid: "#eee" };

// 六维评分固定六格，顺序恒定
{
  const cells = buildScoreCells(snapshot({ market_heat_score: 6 }));
  assert.deepEqual(cells.map((item) => item.key), TRACK_SCORE_DIMENSIONS.map((item) => item.key));
  assert.equal(cells[0].value, 6);
  // 没有快照也要给出六行骨架，表格不能塌；缺值是 null 不是 0
  assert.equal(buildScoreCells(null).length, 6);
  assert.equal(buildScoreCells(null).every((item) => item.value === null), true);
  // 0 分是真实分数，不能被当成缺值
  assert.equal(buildScoreCells(snapshot({ market_heat_score: 0 }))[0].value, 0);
  assert.equal(buildScoreCells(snapshot({ market_heat_score: NaN }))[0].value, null);
}

// 三周期各用自己的来源；未覆盖不复制主导周期，明确待验证不回退为旧方向。
{
  const cells = buildCycleCells({
    short: { direction: "uncertain", judgment: "等待交付", confidence: "low", snapshot_id: 22, report_id: 102, research_date: "2026-11-06" },
    long: { direction: "positive", judgment: "需求持续", confidence: "high", snapshot_id: 9, report_id: 90, research_date: "2026-10-03" }
  });
  assert.deepEqual(cells.map((cell) => cell.cycle), ["short", "mid", "long"]);
  assert.equal(cells[0].view.direction, "uncertain");
  assert.equal(cells[0].view.research_date, "2026-11-06");
  assert.equal(cells[1].view, null);
  assert.equal(cells[2].view.research_date, "2026-10-03");
  assert.equal(buildCycleCells(null).every((cell) => cell.view === null), true);
}

// 新定性报告不能让旧评分看起来刚更新，同日修订也以快照身份区分。
{
  const source = { snapshot_id: 9, report_id: 90, research_date: "2026-10-03" };
  assert.equal(scoreSourceText(null, 22), "暂无评分");
  assert.equal(scoreSourceText(source, 22), "历史评分 2026-10-03");
  assert.equal(scoreSourceText(source, 9), "2026-10-03");
}

// 验证提醒只使用传入日期，不继承其他报告；按北京时间跨日。
{
  const now = new Date("2026-11-05T16:30:00Z");
  assert.equal(verificationStatus(null, now), null);
  assert.equal(verificationStatus("2026-11-05", now), "overdue");
  assert.equal(verificationStatus("2026-11-06", now), "due");
  assert.equal(verificationStatus("2026-11-07", now), "upcoming");
  assert.equal(verificationStatus("invalid", now), null);
}

// 最新报告正文只显示本次覆盖周期，来源来自该报告身份，不接受 JSON 冒充来源。
{
  const raw = snapshot({ id: 22, report_id: 102, research_date: "2026-11-06", overall_score: null,
    cycle_views_json: JSON.stringify({ short: { direction: "uncertain", judgment: "等待交付", confidence: "low", research_date: "2099-01-01" } }) });
  const views = snapshotCycleViews(raw);
  assert.equal(views.short.research_date, "2026-11-06");
  assert.equal(views.short.snapshot_id, 22);
  assert.equal(views.long, undefined);
  assert.deepEqual(snapshotCycleViews({ cycle_views_json: "bad-json" }), {});
  assert.equal(hasResearchContent({ id: 22, research_date: "2026-11-06", cycle_views_json: raw.cycle_views_json }), true);
}

// 未打分的报告留在时间线上形成真实缺口，不能连线越过或补成 0。
{
  const option = buildScoreTimelineOption([
    { id: 3, research_date: "2026-11-06", overall_score: 7, market_heat_score: 6 },
    { id: 2, research_date: "2026-11-06", overall_score: null, market_heat_score: null },
    { id: 1, research_date: "2026-10-03", overall_score: 6, market_heat_score: 5 }
  ], "light", palette);
  assert.deepEqual(option.series[0].data, [6, null, 7]);
  assert.deepEqual(option.series[1].data, [5, null, 6]);
  assert.equal(option.series.every((series) => series.connectNulls === false), true);
}

// 六项分析固定六格，缺值也占位
{
  const cells = buildAnalysisCells({ demand_space: "推理需求接棒" });
  assert.equal(cells.length, 6);
  assert.equal(cells[0].value, "推理需求接棒");
  assert.equal(cells[1].value, undefined);
  assert.equal(buildAnalysisCells(null).length, 6);
}

// 维度顺序是对外契约：雷达图和明细表共用，错位会让两边对不上
{
  assert.deepEqual(TRACK_SCORE_DIMENSIONS.map((item) => item.key), [
    "market_heat_score",
    "growth_speed_score",
    "concentration_score",
    "cycle_resilience_score",
    "current_market_size_score",
    "future_market_size_score"
  ]);
}

// JSON 列解析失败必须降级成空数组，不能抛
{
  assert.deepEqual(splitSegments("不是 JSON"), { benefiting: [], pressured: [] });
  assert.deepEqual(orderScenarios("{坏数据"), []);
  assert.deepEqual(parseDataSources(null), []);
  // 是 JSON 但不是数组，同样降级
  assert.deepEqual(orderScenarios('{"name":"base"}'), []);
}

// 受益与承压分开，元素缺 segment 的脏数据丢弃
{
  const raw = JSON.stringify([
    { segment: "先进封装", stance: "benefiting" },
    { segment: "通用服务器", stance: "pressured" },
    { stance: "benefiting" }
  ]);
  const { benefiting, pressured } = splitSegments(raw);
  assert.deepEqual(benefiting.map((item) => item.segment), ["先进封装"]);
  assert.deepEqual(pressured.map((item) => item.segment), ["通用服务器"]);
}

// 情景固定按 基准 / 乐观 / 不利 排，报告里顺序乱了也要纠正
{
  const raw = JSON.stringify([{ name: "bear" }, { name: "bull" }, { name: "base" }]);
  assert.deepEqual(orderScenarios(raw).map((item) => item.name), ["base", "bull", "bear"]);
}

// 有没有研究内容，决定显示正文还是占位
{
  assert.equal(hasResearchContent(null), false);
  assert.equal(hasResearchContent({ headline_cycle: "long" }), false, "只有卡片字段不算有研究内容");
  assert.equal(hasResearchContent(snapshot()), true, "打了分就算有结论，长文本可以缺");
  assert.equal(hasResearchContent({ core_judgment: "算力需求扩张" }), true);
  assert.equal(hasResearchContent({ demand_space: "推理接棒" }), true);
  assert.equal(
    hasResearchContent({ segments_json: JSON.stringify([{ segment: "先进封装", stance: "benefiting" }]) }),
    true
  );
}

// 快照摘要：空快照返回 null，不返回一堆空字段让调用方自己判断
{
  assert.equal(buildSnapshotSummary(null), null);
  const summary = buildSnapshotSummary(snapshot({ core_judgment: "" }));
  assert.equal(summary.researchDate, "2026-07-05");
  assert.equal(summary.trackGrade, "S");
  assert.equal(summary.heatTier, "T1");
  assert.equal(summary.overallScore, 8.08);
  assert.equal(summary.coreJudgment, null, "空串要归一成 null");
}

// 评分走势图：两条线、按日期升序、纵轴固定满分 10
{
  const option = buildScoreTimelineOption(
    [
      { research_date: "2026-07-05", overall_score: 8.08, market_heat_score: 8.5 },
      { research_date: "2026-05-01", overall_score: 6.2, market_heat_score: 4 }
    ],
    "light",
    palette
  );
  assert.deepEqual(option.xAxis.data, ["2026-05-01", "2026-07-05"]);
  assert.equal(option.series.length, 2);
  assert.deepEqual(option.series[0].data, [6.2, 8.08]);
  assert.deepEqual(option.series[1].data, [4, 8.5]);
  assert.equal(option.yAxis.max, 10, "纵轴固定 0—10，自适应会让 5 分看起来像顶格");
  assert.equal(option.yAxis.min, 0);
}

// 雷达图：六个指标满分固定 10，缺值传 null 让 ECharts 断点，不补 0
{
  const option = buildScoreRadarOption(snapshot(), "light", palette);
  assert.equal(option.radar.indicator.length, 6);
  assert.equal(option.radar.indicator.every((item) => item.max === 10), true);
  assert.deepEqual(option.series[0].data[0].value, [8.5, 9, 8, 6.5, 7.5, 9]);
  assert.deepEqual(buildScoreRadarOption(null, "light", palette).series[0].data[0].value, [
    null, null, null, null, null, null
  ]);
}

console.log("trackTrendPresentation tests passed");
