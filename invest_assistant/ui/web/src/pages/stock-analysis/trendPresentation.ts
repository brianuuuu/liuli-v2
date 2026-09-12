import type { EChartsOption } from "echarts";
import type { StockTrendSnapshot } from "../../types/api";
import { stockChartPalette } from "./stockChartPalette.ts";

/** T0 最强，数字越大越弱。图表按强度画，所以纵轴要反过来。 */
export const TREND_LEVELS = ["T0", "T1", "T2", "T3", "T4", "T5"] as const;

export type TrendLevelTone = "strong" | "medium" | "weak";

export function trendLevelTone(level?: string | null): TrendLevelTone {
  const index = TREND_LEVELS.indexOf(String(level || "").toUpperCase() as (typeof TREND_LEVELS)[number]);
  if (index < 0) return "weak";
  if (index <= 1) return "strong";
  if (index === 2) return "medium";
  return "weak";
}

export function suggestedGroupLabel(value?: string | null) {
  if (!value) return "-";
  return {
    focused: "重点",
    candidate: "候选",
    watching: "观察",
    archived: "归档"
  }[value] ?? value;
}

/** 六维判断：赛道拆三个期限，其余四维各一格。 */
export function buildTrendDimensions(snapshot: Partial<StockTrendSnapshot>) {
  return [
    { label: "赛道·短期", value: snapshot.track_short },
    { label: "赛道·中期", value: snapshot.track_mid },
    { label: "赛道·长期", value: snapshot.track_long },
    { label: "公司地位", value: snapshot.company_position },
    { label: "市场认可", value: snapshot.market_recognition },
    { label: "资金认可", value: snapshot.capital_recognition },
    { label: "日线位置", value: snapshot.stock_stage },
    { label: "主线周期", value: snapshot.mainline_cycle }
  ].map((item) => ({ ...item, value: item.value || "-" }));
}

export function buildLatestTrendSummary(snapshot: Partial<StockTrendSnapshot>) {
  return {
    trendLevel: snapshot.trend_level || "-",
    levelTone: trendLevelTone(snapshot.trend_level),
    stockStage: snapshot.stock_stage || "-",
    mainTrack: snapshot.main_track || "-",
    suggestedGroup: suggestedGroupLabel(snapshot.suggested_group),
    priorityRank: snapshot.priority_rank ?? null,
    trendDuration: snapshot.trend_duration || "-",
    researchDate: snapshot.research_date || null,
    marketDataDate: snapshot.market_data_date || null,
    researcherCode: snapshot.researcher_code || null
  };
}

type TrendLevelRow = Pick<StockTrendSnapshot, "research_date" | "trend_level">;

export function buildTrendLevelTimelineOption(rows: TrendLevelRow[], mode: "light" | "dark"): EChartsOption {
  const palette = stockChartPalette(mode);
  const ordered = [...rows]
    .filter((item) => item.research_date && TREND_LEVELS.includes(String(item.trend_level).toUpperCase() as (typeof TREND_LEVELS)[number]))
    .sort((a, b) => String(a.research_date).localeCompare(String(b.research_date)));
  return {
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const rows = params as { axisValue?: string; data?: number }[];
        const first = rows?.[0];
        if (!first) return "";
        return `${first.axisValue}<br/>${TREND_LEVELS[first.data ?? 0] ?? "-"}`;
      }
    },
    grid: { left: 54, right: 18, top: 24, bottom: 30 },
    xAxis: {
      type: "category",
      data: ordered.map((item) => item.research_date),
      axisLabel: { color: palette.text },
      axisLine: { lineStyle: { color: palette.grid } },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      inverse: true,
      min: 0,
      max: TREND_LEVELS.length - 1,
      interval: 1,
      name: "T 等级",
      nameTextStyle: { color: palette.text },
      axisLabel: { color: palette.text, formatter: (value: number) => TREND_LEVELS[value] ?? "" },
      splitLine: { lineStyle: { color: palette.grid } }
    },
    series: [
      {
        name: "T 等级",
        type: "line",
        step: "end",
        symbolSize: 7,
        lineStyle: { color: palette.accent, width: 2 },
        itemStyle: { color: palette.accent },
        data: ordered.map((item) => TREND_LEVELS.indexOf(String(item.trend_level).toUpperCase() as (typeof TREND_LEVELS)[number]))
      }
    ]
  };
}
