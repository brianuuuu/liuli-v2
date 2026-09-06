import type { StockDetail, StockDetailMaterial, StockScoreSnapshot } from "../types/api";

export type StockDetailSection = "overview" | "rating" | "materials" | "notes";

export const DEFAULT_STOCK_DETAIL_SECTION: StockDetailSection = "overview";

export const STOCK_DETAIL_SECTIONS: { value: StockDetailSection; label: string }[] = [
  { value: "overview", label: "概览" },
  { value: "rating", label: "评分估值" },
  { value: "materials", label: "材料" },
  { value: "notes", label: "笔记" }
];

export const SCORE_DIMENSIONS: { key: keyof StockScoreSnapshot; label: string }[] = [
  { key: "business_moat_score", label: "壁垒" },
  { key: "management_score", label: "管理" },
  { key: "governance_score", label: "治理" },
  { key: "strategy_score", label: "战略" },
  { key: "certainty_score", label: "确定性" },
  { key: "growth_score", label: "成长" }
];

export function scoreDimensions(score: StockScoreSnapshot) {
  return SCORE_DIMENSIONS.map((item) => ({ name: item.label, value: Number(score[item.key] ?? 0) }));
}

export function formatValuationGap(value?: number | null) {
  if (value === null || value === undefined) return "-";
  const percent = Number(value) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

/** 沿用 App 的涨红跌绿约定，复用全局 .positive / .negative。 */
export function valuationGapTone(value?: number | null) {
  if (value === null || value === undefined || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

export function valuationModelLabel(value?: string | null) {
  if (!value) return "-";
  return { revenue: "营收模型", profit: "利润模型", fcf: "FCF 模型" }[value] ?? value;
}

/** 与 Web 材料公告一致：默认隐藏已忽略和噪音材料。 */
export function isActionableMaterial(row: StockDetailMaterial) {
  return row.status !== "ignored" && row.impact_direction !== "noise";
}

export function actionableMaterials(rows: StockDetailMaterial[]) {
  return rows.filter(isActionableMaterial);
}

export function trackNames(detail: StockDetail) {
  return detail.tracks
    .map((item) => item.track?.name?.trim())
    .filter((name): name is string => Boolean(name));
}

/** 评分趋势按时间正序，移动端只显示最近 8 期，避免柱子挤成一片。 */
export function scoreTrendRows(rows: StockScoreSnapshot[], max = 8) {
  return [...rows]
    .sort((a, b) => String(a.report_time).localeCompare(String(b.report_time)))
    .slice(-max);
}
