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
  STRENGTH_LEVEL,
  buildAnalysisCells,
  buildCycleRows,
  buildSnapshotSummary,
  buildStrengthTimelineOption,
  hasResearchContent,
  orderScenarios,
  parseDataSources,
  splitSegments,
  strengthTone
} = await import(pathToFileURL(compiledPath).href);

const palette = { text: "#333", grid: "#eee" };

// 三周期固定三行，顺序恒定，headline 那一行要能被标出来
{
  const rows = buildCycleRows({ headline_cycle: "long", short_strength: "medium", long_strength: "strong" });
  assert.deepEqual(rows.map((item) => item.key), ["short", "mid", "long"]);
  assert.deepEqual(rows.map((item) => item.isHeadline), [false, false, true]);
  assert.equal(rows[0].strength, "medium");
  assert.equal(rows[2].strength, "strong");
  // 没有快照也要给出三行骨架，表格不能塌
  assert.equal(buildCycleRows(null).length, 3);
  assert.equal(buildCycleRows(null).every((item) => !item.isHeadline), true);
}

// 六项分析固定六格，缺值也占位
{
  const cells = buildAnalysisCells({ demand_space: "推理需求接棒" });
  assert.equal(cells.length, 6);
  assert.equal(cells[0].value, "推理需求接棒");
  assert.equal(cells[1].value, undefined);
  assert.equal(buildAnalysisCells(null).length, 6);
}

// 强度序数：证据不足是 0，不是"没有值"，不能和 null 混为一谈
{
  assert.equal(STRENGTH_LEVEL.insufficient, 0);
  assert.equal(STRENGTH_LEVEL.strong, 3);
  assert.equal(strengthTone("strong"), "strong");
  assert.equal(strengthTone("insufficient"), "unknown");
  assert.equal(strengthTone(null), "unknown");
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
  assert.equal(hasResearchContent({ headline_strength: "strong" }), false, "只有卡片字段不算有研究内容");
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
  const summary = buildSnapshotSummary({ research_date: "2026-07-05", priority_rank: 1, core_judgment: "" });
  assert.equal(summary.researchDate, "2026-07-05");
  assert.equal(summary.priorityRank, 1);
  assert.equal(summary.coreJudgment, null, "空串要归一成 null");
}

// 强度走势图：三条线、按日期升序、缺值留 null 而不是 0
{
  const option = buildStrengthTimelineOption(
    [
      { research_date: "2026-07-05", short_strength: "medium", mid_strength: "strong", long_strength: "strong" },
      { research_date: "2026-05-01", short_strength: "weak", mid_strength: null, long_strength: "medium" }
    ],
    "light",
    palette
  );
  assert.deepEqual(option.xAxis.data, ["2026-05-01", "2026-07-05"]);
  assert.equal(option.series.length, 3);
  assert.deepEqual(option.series[0].data, [1, 2]);
  assert.deepEqual(option.series[1].data, [null, 3], "缺值必须是 null，落成 0 会被读成证据不足");
  assert.equal(option.yAxis.max, 3);
  assert.equal(option.yAxis.axisLabel.formatter(0), "证据不足");
  assert.equal(option.yAxis.axisLabel.formatter(3), "强");
}

console.log("trackTrendPresentation tests passed");
