import { Tag } from "antd";

/** 归档 = 软删除，等同回收站，不进任何默认列表。 */
export const ARCHIVED_STATUS = "archived";

export const poolStatusOptions = [
  { value: "focused", label: "重点跟踪" },
  { value: "watching", label: "观察" },
  { value: "candidate", label: "候选" },
  { value: ARCHIVED_STATUS, label: "归档" }
];

export function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

export function StatusTag({ status }: { status?: string | null }) {
  const color = status === "focused" ? "green" : status === "watching" ? "blue" : status === ARCHIVED_STATUS ? "default" : "gold";
  const label = poolStatusOptions.find((item) => item.value === status)?.label || status || "未知";
  return <Tag color={color}>{label}</Tag>;
}
