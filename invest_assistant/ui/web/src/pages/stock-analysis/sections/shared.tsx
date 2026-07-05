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
  const ordered = [...rows].sort((a, b) => a.report_time.localeCompare(b.report_time));
  return {
    tooltip: { trigger: "axis" },
    grid: { left: 42, right: 18, top: 26, bottom: 28 },
    xAxis: { type: "category", data: ordered.map((item) => item.report_time) },
    yAxis: { type: "value", min: 0, max: 10 },
    series: [
      { name: "总分", type: "line", smooth: true, data: ordered.map((item) => item.total_score) },
      { name: "壁垒", type: "line", smooth: true, data: ordered.map((item) => item.business_moat_score) },
      { name: "管理", type: "line", smooth: true, data: ordered.map((item) => item.management_score) },
      { name: "治理", type: "line", smooth: true, data: ordered.map((item) => item.governance_score) },
      { name: "战略", type: "line", smooth: true, data: ordered.map((item) => item.strategy_score) },
      { name: "确定性", type: "line", smooth: true, data: ordered.map((item) => item.certainty_score) },
      { name: "成长", type: "line", smooth: true, data: ordered.map((item) => item.growth_score) }
    ]
  };
}
