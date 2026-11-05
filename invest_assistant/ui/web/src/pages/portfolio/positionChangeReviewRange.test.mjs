import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(sourcePath, customRequire = require) {
  const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(customRequire, module, module.exports);
  return module.exports;
}

const dayjs = require("dayjs");
const { buildPositionChangeReviewRange, positionChangeReviewRangeParams } = load("./positionChangeReviewRange.ts");
const today = dayjs("2026-11-05T23:59:00");

test("默认近一个月，使用本地日期且保留当天", () => {
  assert.deepEqual(positionChangeReviewRangeParams(buildPositionChangeReviewRange("month", today)), {
    start_date: "2026-10-05", end_date: "2026-11-05"
  });
});

test("快捷近一星期含当天共七天，近三个月按自然月回退", () => {
  assert.deepEqual(positionChangeReviewRangeParams(buildPositionChangeReviewRange("week", today)), {
    start_date: "2026-10-30", end_date: "2026-11-05"
  });
  assert.deepEqual(positionChangeReviewRangeParams(buildPositionChangeReviewRange("quarter", today)), {
    start_date: "2026-08-05", end_date: "2026-11-05"
  });
});

test("月底回退正确处理二月和跨年", () => {
  assert.deepEqual(positionChangeReviewRangeParams(buildPositionChangeReviewRange("month", dayjs("2026-03-31"))), {
    start_date: "2026-02-28", end_date: "2026-03-31"
  });
  assert.deepEqual(positionChangeReviewRangeParams(buildPositionChangeReviewRange("quarter", dayjs("2026-01-05"))), {
    start_date: "2025-10-05", end_date: "2026-01-05"
  });
});

test("手动范围原样传递起止日期，不把结束日期当作行情评估截止日", () => {
  assert.deepEqual(positionChangeReviewRangeParams([dayjs("2026-08-03"), dayjs("2026-09-19")] ), {
    start_date: "2026-08-03", end_date: "2026-09-19"
  });
});

test("API 同时传递组合与两个日期，所有组合不传 portfolio_id", async () => {
  const calls = [];
  const api = load("../../api/portfolio.ts", (name) => name === "./client" ? {
    apiClient: { get: async (...args) => { calls.push(args); return { data: { rows: [] } }; } }
  } : require(name));
  const range = { start_date: "2026-10-05", end_date: "2026-11-05" };
  await api.getPositionChangeReview(3, range);
  await api.getPositionChangeReview(null, range);
  assert.deepEqual(calls, [
    ["/api/portfolios/position-change-review", { params: { portfolio_id: 3, ...range } }],
    ["/api/portfolios/position-change-review", { params: range }]
  ]);
});
