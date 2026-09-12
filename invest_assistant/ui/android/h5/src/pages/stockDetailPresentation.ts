import type { StockDetail, StockDetailMaterial, StockScoreSnapshot, StockTrendSnapshot, StockValuationSnapshot } from "../types/api";

export type StockDetailSection = "overview" | "rating" | "valuation" | "trend" | "materials" | "notes";

export const DEFAULT_STOCK_DETAIL_SECTION: StockDetailSection = "overview";

export const STOCK_DETAIL_SECTIONS: { value: StockDetailSection; label: string }[] = [
  { value: "overview", label: "概览" },
  { value: "rating", label: "评级" },
  { value: "valuation", label: "估值" },
  { value: "trend", label: "趋势" },
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


/** T0 最强，数字越大越弱。 */
export const TREND_LEVELS = ["T0", "T1", "T2", "T3", "T4", "T5"];

/** 沿用 App 的涨红跌绿约定：强势标红，弱势走灰。 */
export function trendLevelTone(level?: string | null) {
  const index = TREND_LEVELS.indexOf(String(level || "").toUpperCase());
  if (index < 0) return "";
  return index <= 1 ? "positive" : "";
}

export function suggestedGroupLabel(value?: string | null) {
  if (!value) return "-";
  return { focused: "重点", candidate: "候选", watching: "观察", archived: "归档" }[value] ?? value;
}

export function priorityRankLabel(value?: number | null) {
  return value === null || value === undefined ? "未做全池排名" : `全池第 ${value} 位`;
}

/**
 * 六维判断，与报告正文的六维表格一一对应。
 * 赛道趋势三个期限合成一行；市场认可和资金认可常是整句话，移动端按可换行文本渲染，不做截断。
 */
export function trendDimensions(snapshot: StockTrendSnapshot) {
  const horizons = [snapshot.track_short, snapshot.track_mid, snapshot.track_long];
  return [
    { label: "赛道趋势", value: horizons.some(Boolean) ? horizons.map((item) => item || "-").join(" / ") : "-" },
    { label: "公司地位", value: snapshot.company_position || "-" },
    { label: "市场认可", value: snapshot.market_recognition || "-" },
    { label: "资金认可", value: snapshot.capital_recognition || "-" },
    { label: "日线位置", value: snapshot.stock_stage || "-" },
    { label: "主线周期", value: snapshot.mainline_cycle || "-" }
  ];
}

/** 趋势结论里的长文本，空的不占位。 */
export function trendNarratives(snapshot: StockTrendSnapshot) {
  return [
    { label: "核心逻辑", value: snapshot.core_logic, risk: false },
    { label: "主要风险", value: snapshot.primary_risk, risk: true },
    { label: "剩余空间", value: snapshot.remaining_upside, risk: false },
    { label: "持续窗口", value: snapshot.trend_duration, risk: false },
    { label: "下一验证点", value: snapshot.next_verification, risk: false },
    { label: "证据缺口", value: snapshot.data_gaps, risk: false }
  ].filter((item) => Boolean(item.value?.trim()));
}

/** 历史列表按时间倒序，最新的在最前面。 */
export function trendHistoryRows(rows: StockTrendSnapshot[]) {
  return [...rows].sort((a, b) => String(b.research_date).localeCompare(String(a.research_date)));
}

export function valuationHistoryRows(rows: StockValuationSnapshot[]) {
  return [...rows].sort((a, b) => String(b.analysis_date || "").localeCompare(String(a.analysis_date || "")));
}
