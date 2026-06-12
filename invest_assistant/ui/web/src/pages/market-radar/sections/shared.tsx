import { Tag } from "antd";
import type { EChartsOption } from "echarts";
import type { MarketTag, TagHeat } from "../../../types/api";

export const rankingTypeOptions = [
  { value: "all", label: "全部" },
  { value: "hotword", label: "市场热词" },
  { value: "track", label: "赛道" },
  { value: "stock", label: "标的" }
];

export const windowOptions = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" }
];

const HEAT_TREND_LINE_COLOR = "#19d9a3";
const HEAT_TREND_AREA_COLOR = "rgba(25, 217, 163, 0.18)";

export function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

export function formatDateLabel(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(5, 10);
}

export function tagTypeLabel(type?: string | null) {
  if (type === "stock") return "标的";
  if (type === "track") return "赛道";
  if (type === "hotword") return "市场热词";
  return type || "-";
}

export function TagTypeTag({ type }: { type?: string | null }) {
  const color = type === "stock" ? "blue" : type === "track" ? "purple" : type === "hotword" ? "orange" : "default";
  return <Tag color={color}>{tagTypeLabel(type)}</Tag>;
}

export function tagName(record: TagHeat) {
  return record.tag?.name || `#${record.tag_id}`;
}

export function heatBarOption(rows: TagHeat[]): EChartsOption {
  const topRows = rows.slice(0, 10).reverse();
  return {
    tooltip: {},
    grid: { left: 96, right: 18, top: 16, bottom: 24 },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: topRows.map(tagName) },
    series: [
      {
        type: "bar",
        data: topRows.map((item) => Number(item.heat_score || 0)),
        barWidth: 12,
        itemStyle: { borderRadius: [0, 4, 4, 0] }
      }
    ]
  };
}

export function smoothHeatTrendRows(rows: TagHeat[], alpha = 0.4): number[] {
  let previous: number | null = null;
  return rows.map((item) => {
    const raw = Number(item.heat_score || 0);
    const smoothed = previous == null ? raw : raw * alpha + previous * (1 - alpha);
    previous = smoothed;
    return Number(smoothed.toFixed(2));
  });
}

export function trendLineOption(rows: TagHeat[], title?: string, windowType?: string): EChartsOption {
  const visibleRows = rows.filter((item) => !windowType || item.window_type === windowType);
  const smoothedValues = smoothHeatTrendRows(visibleRows);
  const dateAxisLabels = visibleRows.map((item, index) => {
    const dateLabel = formatDateLabel(item.stat_time);
    const previousDateLabel = formatDateLabel(visibleRows[index - 1]?.stat_time);
    return index === 0 || dateLabel !== previousDateLabel ? dateLabel : "";
  });
  return {
    backgroundColor: "#11161d",
    color: ["#19d9a3"],
    tooltip: {
      trigger: "axis",
      backgroundColor: "#ffffff",
      borderColor: "rgba(15, 23, 42, 0.12)",
      borderWidth: 1,
      textStyle: { color: "#4b5563", fontSize: 12 },
      axisPointer: {
        type: "shadow",
        shadowStyle: { color: "rgba(148, 163, 184, 0.18)" }
      },
      formatter: (params: unknown) => {
        const points = Array.isArray(params) ? params : [params];
        const first = points[0] as { dataIndex?: number } | undefined;
        const row = visibleRows[Number(first?.dataIndex ?? 0)];
        const values = [`原始: ${Number(row?.heat_score || 0).toFixed(1)}`, `平滑: ${smoothedValues[Number(first?.dataIndex ?? 0)]?.toFixed(1) ?? "0.0"}`];
        return [formatTime(row?.stat_time), ...values].join("<br/>");
      }
    },
    grid: { left: 42, right: 20, top: 26, bottom: 34 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dateAxisLabels,
      axisLine: { lineStyle: { color: "#2b333f" } },
      axisTick: { show: false },
      axisLabel: { color: "#9ca3af", fontSize: 12 }
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#9ca3af", fontSize: 12 },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.16)" } }
    },
    series: [
      {
        name: `${title || "热度"}`,
        type: "line",
        smooth: true,
        showSymbol: true,
        symbolSize: 8,
        symbol: "circle",
        data: smoothedValues,
        lineStyle: {
          width: 3,
          color: HEAT_TREND_LINE_COLOR,
          shadowBlur: 10,
          shadowColor: "rgba(25, 217, 163, 0.35)"
        },
        itemStyle: {
          color: HEAT_TREND_LINE_COLOR,
          borderColor: "#11161d",
          borderWidth: 2
        },
        areaStyle: {
          color: HEAT_TREND_AREA_COLOR
        },
        emphasis: { focus: "series" }
      }
    ]
  };
}

export function tagKey(tag: MarketTag) {
  return `${tag.type}:${tag.id}`;
}
