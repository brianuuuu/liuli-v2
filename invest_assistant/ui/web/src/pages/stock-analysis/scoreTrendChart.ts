import type { EChartsOption } from "echarts";
import type { StockScoreSnapshot } from "../../types/api";

export type ScoreTrendMetric =
  | "total_score"
  | "business_moat_score"
  | "management_score"
  | "governance_score"
  | "strategy_score"
  | "certainty_score"
  | "growth_score";

export const DEFAULT_SCORE_TREND_METRIC: ScoreTrendMetric = "total_score";

export const SCORE_TREND_METRICS: { value: ScoreTrendMetric; label: string; color: string }[] = [
  { value: "total_score", label: "总分", color: "#2563eb" },
  { value: "business_moat_score", label: "壁垒", color: "#7c3aed" },
  { value: "management_score", label: "管理", color: "#0891b2" },
  { value: "governance_score", label: "治理", color: "#0d9488" },
  { value: "strategy_score", label: "战略", color: "#4f46e5" },
  { value: "certainty_score", label: "确定性", color: "#d97706" },
  { value: "growth_score", label: "成长", color: "#16a34a" }
];

type ScoreTrendRow = Pick<
  StockScoreSnapshot,
  "report_time" | ScoreTrendMetric
>;

export function buildScoreTrendBarOption(
  rows: ScoreTrendRow[],
  metric: ScoreTrendMetric = DEFAULT_SCORE_TREND_METRIC
): EChartsOption {
  const selected = SCORE_TREND_METRICS.find((item) => item.value === metric) ?? SCORE_TREND_METRICS[0];
  const ordered = [...rows].sort((a, b) => a.report_time.localeCompare(b.report_time));

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 42, right: 18, top: 18, bottom: 28 },
    xAxis: { type: "category", data: ordered.map((item) => item.report_time) },
    yAxis: { type: "value", min: 0, max: 10, interval: 2 },
    series: [
      {
        name: selected.label,
        type: "bar",
        barMaxWidth: 42,
        itemStyle: { color: selected.color, borderRadius: [4, 4, 0, 0] },
        data: ordered.map((item) => item[selected.value])
      }
    ]
  };
}
