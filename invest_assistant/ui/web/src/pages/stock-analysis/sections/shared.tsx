import { Tag } from "antd";
import type { EChartsOption } from "echarts";
import type { StockScoreSnapshot } from "../../../types/api";

export const poolStatusOptions = [
  { value: "watching", label: "watching" },
  { value: "holding", label: "holding" },
  { value: "excluded", label: "excluded" },
  { value: "archived", label: "archived" }
];

export function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

export function StatusTag({ status }: { status?: string | null }) {
  const color = status === "holding" ? "green" : status === "excluded" ? "red" : status === "archived" ? "default" : "blue";
  return <Tag color={color}>{status || "unknown"}</Tag>;
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
