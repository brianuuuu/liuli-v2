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
 * 概览是"投资一页纸"：只放结论、跟踪点和变化，评分雷达、估值明细、六维这些证据留在各自页签。
 * 每条都带上出处页签，点一下跳过去看全文。
 */

export type OverviewThesis = { label: string; values: string[]; risk: boolean; section: StockDetailSection };

/** 评级的核心逻辑讲基本面，趋势的核心逻辑讲交易，两份研究合起来才是完整论点；两边风险合成一条，原文相同的只留一份。 */
export function overviewTheses(detail: StockDetail): OverviewThesis[] {
  const score = detail.latest_score;
  const trend = detail.latest_trend;
  const text = (value?: string | null) => value?.trim() || "";
  const risks = [...new Set([text(score?.primary_risk), text(trend?.primary_risk)].filter(Boolean))];
  return [
    { label: "基本面逻辑", values: [text(score?.core_logic)].filter(Boolean), risk: false, section: "rating" as const },
    { label: "交易逻辑", values: [text(trend?.core_logic)].filter(Boolean), risk: false, section: "trend" as const },
    { label: "主要风险", values: risks, risk: true, section: text(score?.primary_risk) ? "rating" as const : "trend" as const }
  ].filter((item) => item.values.length > 0);
}

export type OverviewWatchItem = { label: string; value: string; section: StockDetailSection };

/** 跟踪清单：下一期要验证什么。估值假设就是下一期财报要兑现的指标，持有时最该盯。 */
export function overviewWatchlist(detail: StockDetail): OverviewWatchItem[] {
  const trend = detail.latest_trend;
  const assumptions = parseValuationAssumptions(detail.latest_valuation?.valuation_assumptions_json);
  const current = (assumptions?.current_assumptions ?? [])
    .map((item) => (item.assumed ? `${item.metric} ${item.assumed}` : item.metric))
    .join(" · ");
  const resultCounts = new Map<string, number>();
  for (const item of assumptions?.last_assumptions_vs_actual ?? []) {
    if (item.result) resultCounts.set(item.result, (resultCounts.get(item.result) ?? 0) + 1);
  }
  const verified = [...resultCounts].map(([result, count]) => `${count} 项${result}`).join(" · ");
  return [
    { label: "下一验证点", value: trend?.next_verification?.trim() || "", section: "trend" as const },
    { label: "估值假设", value: current, section: "valuation" as const },
    { label: "上期兑现", value: verified, section: "valuation" as const },
    { label: "证据缺口", value: trend?.data_gaps?.trim() || "", section: "trend" as const }
  ].filter((item) => Boolean(item.value));
}

export type OverviewChange = {
  label: string;
  from: string | null;
  to: string;
  /** up 变好、down 变差，配色沿用涨红跌绿；first 表示只有一期，无从比较。 */
  direction: "up" | "down" | "flat" | "first";
  date: string;
  section: StockDetailSection;
};

function compareDirection(previous: number, current: number): OverviewChange["direction"] {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

/**
 * 最近一次研究和上一次比变了什么。估值比的是三年合理市值而不是估值空间：
 * 空间跟着每天收盘价动，合理市值只在研究员重估时变，才算研究结论的变化。
 */
export function overviewChanges(detail: StockDetail): OverviewChange[] {
  const changes: OverviewChange[] = [];
  const scores = scoreTrendRows(detail.score_history ?? [], 2);
  const score = scores[scores.length - 1];
  if (score) {
    const previous = scores.length > 1 ? scores[0] : null;
    const describe = (item: StockScoreSnapshot) => `${item.investment_level || "-"} ${formatScore(item.total_score)}`;
    changes.push({
      label: "评级",
      from: previous ? describe(previous) : null,
      to: describe(score),
      direction: previous ? compareDirection(Number(previous.total_score), Number(score.total_score)) : "first",
      date: dateOnly(score.report_time),
      section: "rating"
    });
  }
  const trends = trendHistoryRows(detail.trend_history ?? []);
  const trend = trends[0];
  if (trend) {
    const previous = trends[1] ?? null;
    // T0 最强：档位序号变小才是变好，所以拿负的序号比较；认不出的档位不判方向。
    const rank = (item: StockTrendSnapshot) => TREND_LEVELS.indexOf(String(item.trend_level).toUpperCase());
    const comparable = previous !== null && rank(previous) >= 0 && rank(trend) >= 0;
    changes.push({
      label: "趋势",
      from: previous ? previous.trend_level : null,
      to: trend.trend_level,
      direction: !previous ? "first" : comparable ? compareDirection(-rank(previous), -rank(trend)) : "flat",
      date: dateOnly(trend.research_date),
      section: "trend"
    });
  }
  const valuations = valuationHistoryRows(detail.valuation_history ?? []);
  const valuation = valuations[0];
  if (valuation && valuation.expected_market_value_3y !== null && valuation.expected_market_value_3y !== undefined) {
    const previous = valuations[1]?.expected_market_value_3y ?? null;
    changes.push({
      label: "合理市值",
      from: previous === null ? null : formatScore(previous),
      to: formatScore(valuation.expected_market_value_3y),
      direction: previous === null ? "first" : compareDirection(Number(previous), Number(valuation.expected_market_value_3y)),
      date: dateOnly(valuation.analysis_date),
      section: "valuation"
    });
  }
  return changes;
}

export function overviewChangeTone(direction: OverviewChange["direction"]) {
  return direction === "up" ? "positive" : direction === "down" ? "negative" : "";
}

/** 超过一个季度没更新的研究，中间至少隔了一期财报，结论可能已经过时。 */
export const RESEARCH_STALE_DAYS = 90;

export type ResearchFreshness = { label: string; date: string; stale: boolean };

export function researchFreshness(detail: StockDetail, today: Date = new Date()): ResearchFreshness[] {
  const entries = [
    { label: "评级", date: dateOnly(detail.latest_score?.report_time) },
    { label: "估值", date: dateOnly(detail.latest_valuation?.analysis_date) },
    { label: "趋势", date: dateOnly(detail.latest_trend?.research_date) }
  ].filter((item) => Boolean(item.date));
  return entries.map((item) => {
    const time = new Date(`${item.date}T00:00:00`).getTime();
    const stale = !Number.isNaN(time) && today.getTime() - time > RESEARCH_STALE_DAYS * 24 * 3600 * 1000;
    return { ...item, stale };
  });
}

function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function formatScore(value?: number | null) {
  return value === null || value === undefined ? "-" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
