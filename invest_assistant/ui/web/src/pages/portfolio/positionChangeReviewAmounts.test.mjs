import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./positionChangeReviewAmounts.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
}).outputText;
const amounts = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
const { positionChangeToDateAmount, summarizePositionChangeAmounts } = amounts;

test("至今金额采用已经按增减方向折算的效果，不重复取反", () => {
  assert.equal(positionChangeToDateAmount({ amount: 1000, effect_to_date: 0.2, action: "add" }), 200);
  assert.equal(positionChangeToDateAmount({ amount: 1000, effect_to_date: 0.2, action: "reduce" }), 200);
  assert.equal(positionChangeToDateAmount({ amount: 1000, effect_to_date: -0.2, action: "reduce" }), -200);
  assert.equal(positionChangeToDateAmount({ amount: 1000, effect_to_date: 0 }), 0);
});

test("缺少金额或效果均留空，零金额和零效果可正常计算", () => {
  for (const row of [{ amount: 1000 }, { effect_to_date: 0.2 }, { amount: null, effect_to_date: 0.2 },
    { amount: 1000, effect_to_date: NaN }, { amount: Infinity, effect_to_date: 0.2 }]) {
    assert.equal(positionChangeToDateAmount(row), null);
  }
  assert.equal(positionChangeToDateAmount({ amount: 0, effect_to_date: 0.2 }), 0);
});

test("正负半分对称四舍五入，小于半分的损失显示零而不是负零", () => {
  assert.equal(positionChangeToDateAmount({ amount: 1000, effect_to_date: 0.000005 }), 0.01);
  assert.equal(positionChangeToDateAmount({ amount: 1000, effect_to_date: -0.000005 }), -0.01);
  assert.equal(positionChangeToDateAmount({ amount: 1000, effect_to_date: -0.000001 }), 0);
});

test("跨分页汇总全部记录并保留正负金额", () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({
    amount: 1000, effect_to_date: index < 20 ? 0.1 : -0.3, impact_20d: index < 20 ? -10 : 100
  }));
  assert.deepEqual(summarizePositionChangeAmounts(rows), {
    amount: { value: 21000, missing: 0 },
    toDateAmount: { value: 1700, missing: 0 },
    impact20d: { value: -100, missing: 0 }
  });
});

test("缺失不当零：部分汇总带缺失数量，全缺失或空列表显示空值", () => {
  assert.deepEqual(summarizePositionChangeAmounts([
    { amount: 1000, effect_to_date: 0, impact_20d: 0 },
    { amount: 2000, effect_to_date: null },
    { amount: null, effect_to_date: 0.1, impact_20d: null }
  ]), {
    amount: { value: 3000, missing: 1 },
    toDateAmount: { value: 0, missing: 2 },
    impact20d: { value: 0, missing: 2 }
  });
  for (const field of Object.values(summarizePositionChangeAmounts([{}, {}]))) {
    assert.deepEqual(field, { value: null, missing: 2 });
  }
  for (const field of Object.values(summarizePositionChangeAmounts([]))) {
    assert.deepEqual(field, { value: null, missing: 0 });
  }
});

test("逐笔金额保留到分，汇总累加逐笔金额且不修改输入", () => {
  const rows = Object.freeze([
    Object.freeze({ amount: 100.01, effect_to_date: 0.1, impact_20d: 0.1 }),
    Object.freeze({ amount: 100.01, effect_to_date: 0.1, impact_20d: 0.2 })
  ]);
  assert.equal(positionChangeToDateAmount(rows[0]), 10);
  assert.equal(summarizePositionChangeAmounts(rows).toDateAmount.value, 20);
  assert.equal(summarizePositionChangeAmounts(rows).impact20d.value, 0.3);
});

// 测试真实表格组件的列渲染与汇总，不请求 API、不启动数据库。
const require = createRequire(import.meta.url);
const componentCode = ts.transpileModule(readFileSync(new URL("./PositionChangeReview.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", componentCode)((name) => {
  if (name === "antd") return Object.fromEntries(["Table", "Tag", "Tooltip", "Typography"].map((name) => [name, require(`antd/lib/${name.toLowerCase()}`).default]));
  if (name === "./positionChangeReviewAmounts") return amounts;
  if (name === "./positionChangeLabels") return { reasonTypeLabels: { personal: "个人判断" } };
  return require(name);
}, module, module.exports);
const { PositionChangeTable } = module.exports;
const { renderToStaticMarkup } = require("react-dom/server");

test("至今单元格显示金额和 0 日，不再显示百分比", () => {
  const table = PositionChangeTable({ data: { rows: [] }, loading: false });
  const column = table.props.columns.find((item) => item.dataIndex === "effect_to_date");
  const html = renderToStaticMarkup(column.render(0.2, { amount: 1000, effect_to_date: 0.2, to_date_days: 0 }));
  assert.match(html, /\+200/);
  assert.match(html, /0日/);
  assert.doesNotMatch(html, /%/);
});

test("底部合计使用当前筛选的全部数据，不采用当前页；没有记录时不显示合计", () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, change_date: "2026-11-04", amount: 1000, effect_to_date: 0.1, impact_20d: -20 }));
  const table = PositionChangeTable({ data: { rows: [{ changes: rows }] }, loading: false });
  assert.equal(typeof table.props.summary, "function");
  const html = renderToStaticMarkup(table).match(/<tfoot[\s\S]*?<\/tfoot>/)?.[0] || "";
  assert.match(html, /合计/);
  assert.match(html, /11笔/);
  assert.match(html, /\+1,100/);
  assert.match(html, /-220/);
  const empty = PositionChangeTable({ data: { rows: [] }, loading: false });
  assert.equal(empty.props.summary([]), null);
});

test("部分数据缺失时合计行显示缺失数量，不把全缺失显示成零", () => {
  const table = PositionChangeTable({ data: { rows: [{ changes: [
    { id: 1, change_date: "2026-11-04", amount: 1000, effect_to_date: 0.1 },
    { id: 2, change_date: "2026-11-04", amount: 1000, effect_to_date: null }
  ] }] }, loading: false });
  const html = renderToStaticMarkup(table).match(/<tfoot[\s\S]*?<\/tfoot>/)?.[0] || "";
  assert.match(html, /\+100/);
  assert.match(html, /缺1笔/);
  assert.match(html, /缺2笔/);
});
