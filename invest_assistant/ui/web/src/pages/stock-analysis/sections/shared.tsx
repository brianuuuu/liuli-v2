import { Tag } from "antd";
import type { EChartsOption } from "echarts";
import type { StockScoreSnapshot } from "../../../types/api";

export const poolStatusOptions = [
  { value: "focused", label: "重点跟踪" },
  { value: "watching", label: "观察" },
  { value: "candidate", label: "候选" },
  { value: "archived", label: "归档" }
];

export function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

export function StatusTag({ status }: { status?: string | null }) {
  const color = status === "focused" ? "green" : status === "watching" ? "blue" : status === "archived" ? "default" : "gold";
  const label = poolStatusOptions.find((item) => item.value === status)?.label || status || "未知";
  return <Tag color={color}>{label}</Tag>;
}

export function scoreTrendOption(rows: StockScoreSnapshot[]): EChartsOption {
  const ordered = [...rows].sort((a, b) => a.score_date.localeCompare(b.score_date));
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 42, right: 18, top: 26, bottom: 28 },
    xAxis: { type: "category", data: ordered.map((item) => item.score_date) },
    yAxis: { type: "value", min: 0 },
    series: [
      { name: "总分", type: "line", smooth: true, data: ordered.map((item) => item.total_score) },
      { name: "成长", type: "line", smooth: true, data: ordered.map((item) => item.growth_score) },
      { name: "估值", type: "line", smooth: true, data: ordered.map((item) => item.valuation_score) },
      { name: "护城河", type: "line", smooth: true, data: ordered.map((item) => item.moat_score) },
      { name: "风险", type: "line", smooth: true, data: ordered.map((item) => item.risk_score) }
    ]
  };
}
