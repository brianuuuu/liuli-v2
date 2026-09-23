import type { EChartsOption } from "echarts";
import type { StockDetailValuationSnapshot, ValuationAssumptions } from "../../types/api";
import {
  STOCK_CHART_BAR_MAX_WIDTH,
  STOCK_CHART_BAR_RADIUS,
  stockChartPalette
} from "./stockChartPalette.ts";

export type ValuationGapTone = "positive" | "negative" | "flat";

export function formatValuationGap(value?: number | null) {
  if (value === null || value === undefined) return "-";
  const percent = Number(value) * 100;
  const prefix = percent > 0 ? "+" : "";
  return `${prefix}${percent.toFixed(2)}%`;
}

export function valuationGapTone(value?: number | null): ValuationGapTone {
  if (value === null || value === undefined || value === 0) return "flat";
  return value > 0 ? "positive" : "negative";
}

/** 估值假设判定的配色：沿用全站涨红跌绿，超预期是好事走红。 */
const ASSUMPTION_RESULT_TONES: Record<string, ValuationGapTone> = {
  超预期: "positive",
  不如预期: "negative",
  符合预期: "flat"
};

export function assumptionResultTone(result?: string | null): ValuationGapTone | null {
  return result ? ASSUMPTION_RESULT_TONES[result] ?? "flat" : null;
}

/**
 * 估值假设是选填的，落库存的是原始 JSON 文本。解析失败、结构不对一律当没填，
 * 让展示端直接不渲染——给每只老标的留一块空区域比不显示更糟。
 */
export function parseValuationAssumptions(raw?: string | null): ValuationAssumptions | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const hasMetric = (item: unknown) => Boolean(item) && typeof (item as { metric?: unknown }).metric === "string";
    const verification = Array.isArray(parsed.verification) ? parsed.verification.filter(hasMetric) : [];
    const current = Array.isArray(parsed.current) ? parsed.current.filter(hasMetric) : [];
    if (!verification.length && !current.length) return null;
    return { previous_period: parsed.previous_period ?? null, verification, current };
  } catch {
    return null;
  }
}

export function valuationModelLabel(value?: string | null) {
  if (!value) return "-";
  return {
    revenue: "营收模型",
    profit: "利润模型",
    fcf: "FCF 模型"
  }[value] ?? value;
}

export function buildLatestValuationSummary(snapshot: Partial<StockDetailValuationSnapshot>) {
  return {
    currentMarketValue: snapshot.current_market_value ?? null,
    expectedMarketValue3y: snapshot.expected_market_value_3y ?? null,
    gapText: formatValuationGap(snapshot.expectation_gap_rate),
    gapTone: valuationGapTone(snapshot.expectation_gap_rate),
    modelLabel: valuationModelLabel(snapshot.primary_model),
    reportPeriod: snapshot.report_period ?? null,
    analysisDate: snapshot.analysis_date ?? null,
    researcher: snapshot.researcher ?? null
  };
}

type ValuationTrendRow = Pick<
  StockDetailValuationSnapshot,
  "analysis_date" | "current_market_value" | "expected_market_value_3y"
>;

export function buildValuationComparisonOption(
  rows: ValuationTrendRow[],
  mode: "light" | "dark"
): EChartsOption {
  const palette = stockChartPalette(mode);
  const ordered = [...rows]
    .filter((item) => item.analysis_date)
    .sort((a, b) => String(a.analysis_date).localeCompare(String(b.analysis_date)));
  const textColor = palette.text;
  const gridColor = palette.grid;

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, textStyle: { color: textColor } },
    grid: { left: 54, right: 18, top: 38, bottom: 30 },
    xAxis: {
      type: "category",
      data: ordered.map((item) => item.analysis_date || "-"),
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: gridColor } },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      name: "市值",
      nameTextStyle: { color: textColor },
      axisLabel: { color: textColor },
      splitLine: { lineStyle: { color: gridColor } }
    },
    series: [
      {
        name: "当前市值",
        type: "bar",
        barMaxWidth: STOCK_CHART_BAR_MAX_WIDTH,
        itemStyle: { color: palette.muted, borderRadius: STOCK_CHART_BAR_RADIUS },
        data: ordered.map((item) => item.current_market_value ?? null)
      },
      {
        name: "三年合理市值",
        type: "bar",
        barMaxWidth: STOCK_CHART_BAR_MAX_WIDTH,
        itemStyle: { color: palette.accent, borderRadius: STOCK_CHART_BAR_RADIUS },
        data: ordered.map((item) => item.expected_market_value_3y ?? null)
      }
    ]
  };
}
