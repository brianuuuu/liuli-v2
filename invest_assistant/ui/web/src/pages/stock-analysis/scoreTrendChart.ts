import type { EChartsOption } from "echarts";
import type { StockScoreSnapshot } from "../../types/api";
import {
  STOCK_CHART_BAR_MAX_WIDTH,
  STOCK_CHART_BAR_RADIUS,
  stockChartPalette
} from "./stockChartPalette.ts";

export type ScoreTrendMetric =
  | "total_score"
  | "business_moat_score"
  | "management_score"
  | "governance_score"
  | "strategy_score"
  | "certainty_score"
  | "growth_score";

export const DEFAULT_SCORE_TREND_METRIC: ScoreTrendMetric = "total_score";

export const SCORE_TREND_METRICS: { value: ScoreTrendMetric; label: string }[] = [
  { value: "total_score", label: "总分" },
  { value: "business_moat_score", label: "壁垒" },
  { value: "management_score", label: "管理" },
  { value: "governance_score", label: "治理" },
  { value: "strategy_score", label: "战略" },
  { value: "certainty_score", label: "确定性" },
  { value: "growth_score", label: "成长" }
];

type ScoreTrendRow = Pick<
  StockScoreSnapshot,
  "report_time" | ScoreTrendMetric
>;

export function buildScoreTrendBarOption(
  rows: ScoreTrendRow[],
  metric: ScoreTrendMetric = DEFAULT_SCORE_TREND_METRIC,
  mode: "light" | "dark" = "light"
): EChartsOption {
  const palette = stockChartPalette(mode);
  const selected = SCORE_TREND_METRICS.find((item) => item.value === metric) ?? SCORE_TREND_METRICS[0];
  const ordered = [...rows].sort((a, b) => a.report_time.localeCompare(b.report_time));

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 42, right: 18, top: 18, bottom: 28 },
    xAxis: {
      type: "category",
      data: ordered.map((item) => item.report_time),
      axisLabel: { color: palette.text },
      axisLine: { lineStyle: { color: palette.grid } },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 10,
      interval: 2,
      axisLabel: { color: palette.text },
      splitLine: { lineStyle: { color: palette.grid } }
    },
    series: [
      {
        name: selected.label,
        type: "bar",
        barMaxWidth: STOCK_CHART_BAR_MAX_WIDTH,
        itemStyle: { color: palette.accent, borderRadius: STOCK_CHART_BAR_RADIUS },
        data: ordered.map((item) => item[selected.value])
      }
    ]
  };
}
