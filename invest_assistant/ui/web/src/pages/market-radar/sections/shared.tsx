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

export type TrendSummary = {
  latest: number;
  peak: number;
  rank: number | null;
  changePct: number | null;
  from: string;
  to: string;
};

export function trendSummary(rows: TagHeat[]): TrendSummary | null {
  if (!rows.length) return null;
  const scores = rows.map((item) => Number(item.heat_score || 0));
  const first = scores[0];
  const latest = scores[scores.length - 1];
  return {
    latest,
    peak: Math.max(...scores),
    rank: rows[rows.length - 1].rank_no || null,
    changePct: first > 0 ? ((latest - first) / first) * 100 : null,
    from: rows[0].stat_time,
    to: rows[rows.length - 1].stat_time
  };
}

export function trendLineOption(rows: TagHeat[], mode: "light" | "dark", windowType?: string): EChartsOption {
  const dark = mode === "dark";
  const lineColor = dark ? "#3b82f6" : "#2563eb";
  const textColor = dark ? "#8b949e" : "#64748b";
  const gridColor = dark ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.06)";
  const axisColor = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.12)";
  const smoothedValues = smoothHeatTrendRows(rows);
  const times = rows.map((item) => item.stat_time);
  const showTime = windowType === "24h";
  const dense = rows.length > 60;
  return {
    backgroundColor: "transparent",
    animationDuration: 400,
    legend: {
      top: 0,
      right: 0,
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 3,
      textStyle: { color: textColor, fontSize: 12 },
      data: ["平滑热度", "原始热度"]
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: dark ? "#21262d" : "#ffffff",
      borderColor: axisColor,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: dark ? "#e6edf3" : "#0f172a", fontSize: 12 },
      axisPointer: { type: "line", lineStyle: { color: axisColor, type: "dashed" } },
      formatter: (params: unknown) => {
        const points = Array.isArray(params) ? params : [params];
        const index = Number((points[0] as { dataIndex?: number } | undefined)?.dataIndex ?? 0);
        const row = rows[index];
        if (!row) return "";
        return [
          `<div style="margin-bottom:4px;color:${textColor}">${formatTime(row.stat_time).slice(0, 16)}</div>`,
          `平滑热度&nbsp;&nbsp;<b>${smoothedValues[index]?.toFixed(1) ?? "-"}</b>`,
          `原始热度&nbsp;&nbsp;<b>${Number(row.heat_score || 0).toFixed(1)}</b>`,
          `标签命中&nbsp;&nbsp;<b>${row.trigger_count ?? 0}</b>&nbsp;&nbsp;·&nbsp;&nbsp;排名&nbsp;<b>#${row.rank_no ?? "-"}</b>`
        ].join("<br/>");
      }
    },
    grid: { left: 8, right: 12, top: 36, bottom: dense ? 40 : 8, containLabel: true },
    dataZoom: dense ? [{ type: "inside" }, { type: "slider", height: 14, bottom: 6, borderColor: "transparent", textStyle: { color: textColor } }] : undefined,
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: times,
      axisLine: { lineStyle: { color: axisColor } },
      axisTick: { show: false },
      axisLabel: {
        color: textColor,
        fontSize: 11,
        hideOverlap: true,
        formatter: (value: string) => formatTime(value).slice(5, showTime ? 16 : 10)
      }
    },
    yAxis: {
      type: "value",
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: textColor, fontSize: 11 },
      splitLine: { lineStyle: { color: gridColor } }
    },
    series: [
      {
        name: "平滑热度",
        type: "line",
        smooth: 0.3,
        showSymbol: false,
        symbol: "circle",
        symbolSize: 7,
        data: smoothedValues,
        lineStyle: { width: 2.5, color: lineColor },
        itemStyle: { color: lineColor, borderColor: dark ? "#161b22" : "#ffffff", borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: dark ? "rgba(59, 130, 246, 0.28)" : "rgba(37, 99, 235, 0.16)" },
              { offset: 1, color: "rgba(37, 99, 235, 0)" }
            ]
          }
        },
        z: 3
      },
      {
        name: "原始热度",
        type: "line",
        showSymbol: false,
        data: rows.map((item) => Number(item.heat_score || 0)),
        lineStyle: { width: 1, type: "dashed", color: textColor, opacity: 0.6 },
        itemStyle: { color: textColor },
        z: 2
      }
    ]
  };
}

export function tagKey(tag: MarketTag) {
  return `${tag.type}:${tag.id}`;
}
