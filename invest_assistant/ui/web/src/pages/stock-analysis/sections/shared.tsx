import { Tag } from "antd";

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
