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

export function trendLineOption(rows: TagHeat[], title?: string): EChartsOption {
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 42, right: 18, top: 26, bottom: 28 },
    xAxis: { type: "category", data: rows.map((item) => formatTime(item.stat_time).slice(5, 16)) },
    yAxis: { type: "value" },
    series: [
      {
        name: title || "热度",
        type: "line",
        smooth: true,
        data: rows.map((item) => Number(item.heat_score || 0)),
        areaStyle: {}
      }
    ]
  };
}

export function tagKey(tag: MarketTag) {
  return `${tag.type}:${tag.id}`;
}
