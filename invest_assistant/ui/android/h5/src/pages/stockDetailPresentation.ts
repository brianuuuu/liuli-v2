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

/** 后端存的是交易所代码，档案头要给人看，所以在端上翻成中文简称，未知值原样透出。 */
const MARKET_LABELS: Record<string, string> = {
  SH: "上交所",
  SSE: "上交所",
  SZ: "深交所",
  SZSE: "深交所",
  BJ: "北交所",
  BSE: "北交所",
  HK: "港交所",
  US: "美股"
};

export function stockMarketLabel(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return "";
  return MARKET_LABELS[raw.toUpperCase()] ?? raw;
}

/** 档案头第二行：代码 · 交易所，缺哪个就少哪个。 */
export function stockIdentityLine(detail: StockDetail) {
  return [detail.stock.stock_code?.trim(), stockMarketLabel(detail.stock.market)]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
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
