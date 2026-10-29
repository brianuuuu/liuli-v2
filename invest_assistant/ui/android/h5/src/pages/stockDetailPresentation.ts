import type { StockDetail, StockDetailMaterial, StockScoreSnapshot, StockTrendSnapshot, StockValuationSnapshot, ValuationAssumptions } from "../types/api";

export type StockDetailSection = "overview" | "rating" | "valuation" | "trend" | "materials" | "notes";

export const DEFAULT_STOCK_DETAIL_SECTION: StockDetailSection = "overview";

export const STOCK_DETAIL_SECTIONS: { value: StockDetailSection; label: string }[] = [
  { value: "overview", label: "概览" },
  { value: "rating", label: "评级" },
  { value: "valuation", label: "估值" },
  { value: "trend", label: "趋势" },
  { value: "notes", label: "笔记" },
  { value: "materials", label: "材料" }
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

/** 估值假设判定的配色：沿用全站涨红跌绿，超预期是好事走红。 */
const ASSUMPTION_RESULT_TONES: Record<string, string> = {
  超预期: "positive",
  不如预期: "negative",
  符合预期: "neutral"
};

export function assumptionResultTone(result?: string | null) {
  return result ? ASSUMPTION_RESULT_TONES[result] ?? "neutral" : null;
}

/**
 * 估值假设是选填的，落库存的是原始 JSON 文本。解析失败、结构不对一律当没填，
 * 让展示端直接不渲染这张卡——给每只老标的留一张空卡比不显示更糟。
 */
export function parseValuationAssumptions(raw?: string | null): ValuationAssumptions | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const hasMetric = (item: unknown) => Boolean(item) && typeof (item as { metric?: unknown }).metric === "string";
    const lastAssumptionsVsActual = Array.isArray(parsed.last_assumptions_vs_actual)
      ? parsed.last_assumptions_vs_actual.filter(hasMetric)
      : [];
    const currentAssumptions = Array.isArray(parsed.current_assumptions)
      ? parsed.current_assumptions.filter(hasMetric)
      : [];
    if (!lastAssumptionsVsActual.length && !currentAssumptions.length) return null;
    return {
      previous_period: parsed.previous_period ?? null,
      last_assumptions_vs_actual: lastAssumptionsVsActual,
      current_assumptions: currentAssumptions
    };
  } catch {
    return null;
  }
}

export function valuationHistoryRows(rows: StockValuationSnapshot[]) {
  return [...rows].sort((a, b) => String(b.analysis_date || "").localeCompare(String(a.analysis_date || "")));
}

/*
 * 概览只看「最近变化」：评级总分、趋势 T 级、三年合理市值这三个研究结论在历次研究里怎么走。
 * 明细（雷达、估值假设、六维、笔记、材料）都在各自页签里。
 */

export type OverviewTrendPoint = { date: string; value: number; label: string };

export type OverviewTrend = {
  key: "score" | "trend" | "valuation";
  label: string;
  from: string | null;
  to: string;
  /** up 变好、down 变差，配色沿用涨红跌绿；first 表示只有一期，无从比较。 */
  direction: "up" | "down" | "flat" | "first";
  date: string;
  section: StockDetailSection;
  /** 按时间正序，最多最近 OVERVIEW_TREND_POINTS 期。T 级的 value 是档位序号，T0 为 0。 */
  points: OverviewTrendPoint[];
};

export const OVERVIEW_TREND_POINTS = 12;

function compareDirection(previous: number, current: number): OverviewTrend["direction"] {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

function trendFromPoints(
  key: OverviewTrend["key"],
  label: string,
  section: StockDetailSection,
  points: OverviewTrendPoint[],
  /** 数值越大越好时为 1；T 级序号越小越强，传 -1 */
  better: 1 | -1
): OverviewTrend | null {
  const recent = points.slice(-OVERVIEW_TREND_POINTS);
  const latest = recent[recent.length - 1];
  if (!latest) return null;
  const previous = recent.length > 1 ? recent[recent.length - 2] : null;
  return {
    key,
    label,
    from: previous ? previous.label : null,
    to: latest.label,
    direction: previous ? compareDirection(better * previous.value, better * latest.value) : "first",
    date: latest.date,
    section,
    points: recent
  };
}

/**
 * 三条研究结论的变化曲线。估值画三年合理市值而不是估值空间：
 * 空间跟着每天收盘价动，合理市值只在研究员重估时变，才算研究结论的变化。
 */
export function overviewTrends(detail: StockDetail): OverviewTrend[] {
  const scorePoints = scoreTrendRows(detail.score_history ?? [], OVERVIEW_TREND_POINTS).map((item) => ({
    date: dateOnly(item.report_time),
    value: Number(item.total_score),
    label: `${item.investment_level || "-"} ${formatScore(item.total_score)}`
  }));
  const trendPoints = [...(detail.trend_history ?? [])]
    .sort((a, b) => String(a.research_date).localeCompare(String(b.research_date)))
    .map((item) => ({ item, rank: TREND_LEVELS.indexOf(String(item.trend_level).toUpperCase()) }))
    // 认不出的档位没法画在 T0–T5 的轴上，直接略过
    .filter(({ rank }) => rank >= 0)
    .map(({ item, rank }) => ({ date: dateOnly(item.research_date), value: rank, label: TREND_LEVELS[rank] }));
  const valuationPoints = [...(detail.valuation_history ?? [])]
    .sort((a, b) => String(a.analysis_date || "").localeCompare(String(b.analysis_date || "")))
    .filter((item) => item.expected_market_value_3y !== null && item.expected_market_value_3y !== undefined)
    .map((item) => ({
      date: dateOnly(item.analysis_date),
      value: Number(item.expected_market_value_3y),
      label: formatScore(item.expected_market_value_3y)
    }));
  return [
    trendFromPoints("score", "综合评分", "rating", scorePoints, 1),
    trendFromPoints("trend", "趋势", "trend", trendPoints, -1),
    trendFromPoints("valuation", "合理市值", "valuation", valuationPoints, 1)
  ].filter((item): item is OverviewTrend => item !== null);
}

export function overviewChangeTone(direction: OverviewTrend["direction"]) {
  return direction === "up" ? "positive" : direction === "down" ? "negative" : "";
}

function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function formatScore(value?: number | null) {
  return value === null || value === undefined ? "-" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
