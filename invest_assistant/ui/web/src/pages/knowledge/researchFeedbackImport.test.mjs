import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("./researchFeedbackImport.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
});

const tempDir = mkdtempSync(join(tmpdir(), "liuli-feedback-import-"));
const compiledPath = join(tempDir, "researchFeedbackImport.mjs");
writeFileSync(compiledPath, output.outputText);

const { formatFeedbackImportSummary, hasImportFailure } = await import(pathToFileURL(compiledPath));

assert.equal(
  formatFeedbackImportSummary({ target: "stock_score_snapshot", message: "评分导入成功", score: { id: 12 } }),
  "评分导入成功：评分 ID 12"
);

assert.equal(
  formatFeedbackImportSummary({ target: "stock_valuation_snapshot", message: "估值导入成功", valuation: { id: 7 } }),
  "估值导入成功：估值 ID 7"
);

assert.equal(
  formatFeedbackImportSummary({
    target: "stock_trend_snapshot",
    message: "趋势导入完成：成功 1 个，失败 0 个",
    success_count: 1,
    failure_count: 0,
    failures: []
  }),
  "趋势导入完成：成功 1 个，失败 0 个",
  "a single-stock report is just a one-item array, so it uses the same counted message"
);

assert.equal(
  formatFeedbackImportSummary({
    target: "stock_trend_snapshot",
    message: "趋势导入完成：成功 1 个，失败 2 个",
    success_count: 1,
    failure_count: 2,
    failures: [
      { index: 1, stock: "999999", error: "未找到股票: 999999" },
      { index: 2, stock: null, error: "trend_level 必须是 T0、T1、T2、T3、T4、T5" }
    ]
  }),
  "趋势导入完成：成功 1 个，失败 2 个；999999：未找到股票: 999999；第 3 条：trend_level 必须是 T0、T1、T2、T3、T4、T5",
  "failing rows must be named so they can be fixed, falling back to the row number"
);

const manyFailures = {
  target: "stock_trend_snapshot",
  message: "趋势导入完成：成功 1 个，失败 5 个",
  success_count: 1,
  failure_count: 5,
  failures: [0, 1, 2, 3, 4].map((index) => ({ index, stock: `60000${index}`, error: "未找到股票" }))
};
assert.equal(
  formatFeedbackImportSummary(manyFailures).split("；").length,
  4,
  "long failure lists must be truncated so the toast stays readable"
);

assert.equal(hasImportFailure({ target: "x", message: "y", success_count: 2, failure_count: 0 }), false);
assert.equal(hasImportFailure({ target: "x", message: "y", success_count: 1, failure_count: 1 }), true);
assert.equal(hasImportFailure({ target: "x", message: "y", score: { id: 1 } }), false);

console.log("researchFeedbackImport tests passed");
