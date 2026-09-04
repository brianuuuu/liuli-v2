import type { EChartsOption } from "echarts";
import type { StockDetailValuationSnapshot } from "../../types/api";

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
  const dark = mode === "dark";
  const ordered = [...rows]
    .filter((item) => item.analysis_date)
    .sort((a, b) => String(a.analysis_date).localeCompare(String(b.analysis_date)));
  const textColor = dark ? "#aab2bf" : "#64748b";
  const gridColor = dark ? "#2b333e" : "#e5eaf1";

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
        barMaxWidth: 34,
        itemStyle: { color: dark ? "#64748b" : "#94a3b8", borderRadius: [4, 4, 0, 0] },
        data: ordered.map((item) => item.current_market_value ?? null)
      },
      {
        name: "三年合理市值",
        type: "bar",
        barMaxWidth: 34,
        itemStyle: { color: dark ? "#60a5fa" : "#2563eb", borderRadius: [4, 4, 0, 0] },
        data: ordered.map((item) => item.expected_market_value_3y ?? null)
      }
    ]
  };
}
