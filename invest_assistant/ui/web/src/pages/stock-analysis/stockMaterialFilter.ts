import type { StockMaterial } from "../../types/api";

export type MaterialViewMode = "actionable" | "all";

export const DEFAULT_MATERIAL_VIEW_MODE: MaterialViewMode = "actionable";

export const MATERIAL_VIEW_MODES: { value: MaterialViewMode; label: string }[] = [
  { value: "actionable", label: "有效材料" },
  { value: "all", label: "全部" }
];

/**
 * 默认视图只保留有研究价值的材料：隐藏已忽略的记录和被判定为噪音的方向。
 * 未处理（pending）的材料仍然保留，否则确认/忽略操作就没有入口了。
 */
export function isActionableMaterial(row: StockMaterial) {
  return row.status !== "ignored" && row.impact_direction !== "noise";
}

export function filterStockMaterials(
  rows: StockMaterial[],
  mode: MaterialViewMode = DEFAULT_MATERIAL_VIEW_MODE
) {
  return mode === "all" ? rows : rows.filter(isActionableMaterial);
}
