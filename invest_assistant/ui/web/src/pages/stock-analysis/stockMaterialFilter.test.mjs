import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MATERIAL_VIEW_MODE,
  MATERIAL_VIEW_MODES,
  filterStockMaterials
} from "./stockMaterialFilter.ts";

const rows = [
  { id: 1, material_title: "已确认负向", status: "confirmed", impact_direction: "negative" },
  { id: 2, material_title: "已忽略噪音", status: "ignored", impact_direction: "noise" },
  { id: 3, material_title: "已确认噪音", status: "confirmed", impact_direction: "noise" },
  { id: 4, material_title: "未处理中性", status: "pending", impact_direction: "neutral" },
  { id: 5, material_title: "已忽略中性", status: "ignored", impact_direction: "neutral" }
];

test("默认视图隐藏已忽略和噪音材料，保留未处理材料", () => {
  assert.equal(DEFAULT_MATERIAL_VIEW_MODE, "actionable");
  assert.deepEqual(MATERIAL_VIEW_MODES.map((item) => item.value), ["actionable", "all"]);
  assert.deepEqual(filterStockMaterials(rows).map((item) => item.id), [1, 4]);
});

test("全部视图保留原始材料列表", () => {
  assert.deepEqual(filterStockMaterials(rows, "all").map((item) => item.id), [1, 2, 3, 4, 5]);
});
