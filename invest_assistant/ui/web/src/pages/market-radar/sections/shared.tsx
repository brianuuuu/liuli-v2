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
  { value: "1h", label: "1h" },
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

export function trendLineOption(rows: TagHeat[], title?: string, windowType?: string): EChartsOption {
  const visibleRows = rows.filter((item) => !windowType || item.window_type === windowType);
  const dateAxisLabels = visibleRows.map((item, index) => {
    const dateLabel = formatDateLabel(item.stat_time);
    const previousDateLabel = formatDateLabel(visibleRows[index - 1]?.stat_time);
    return index === 0 || dateLabel !== previousDateLabel ? dateLabel : "";
  });
  return {
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const points = Array.isArray(params) ? params : [params];
        const first = points[0] as { dataIndex?: number } | undefined;
        const row = visibleRows[Number(first?.dataIndex ?? 0)];
        const values = points.map((point) => {
          const item = point as { marker?: string; seriesName?: string; value?: unknown };
          return `${item.marker || ""}${item.seriesName || "热度"}: ${Number(item.value || 0).toFixed(1)}`;
        });
        return [formatTime(row?.stat_time), ...values].join("<br/>");
      }
    },
    grid: { left: 42, right: 18, top: 26, bottom: 28 },
    xAxis: { type: "category", data: dateAxisLabels },
    yAxis: { type: "value" },
    series: [
      {
        name: title || "热度",
        type: "line",
        smooth: true,
        data: visibleRows.map((item) => Number(item.heat_score || 0)),
        areaStyle: {}
      }
    ]
  };
}

export function tagKey(tag: MarketTag) {
  return `${tag.type}:${tag.id}`;
}
