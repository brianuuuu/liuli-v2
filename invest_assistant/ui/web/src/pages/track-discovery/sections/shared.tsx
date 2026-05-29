import { Tag } from "antd";
import type { TrackCandidate } from "../../../types/api";

export const trackWindowOptions = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" }
];

export const thesisStatusOptions = [
  { value: "candidate", label: "候选" },
  { value: "active", label: "跟踪中" },
  { value: "paused", label: "暂停观察" },
  { value: "archived", label: "归档" }
];

export const stageOptions = [
  { value: "concept", label: "概念期" },
  { value: "validate", label: "验证期" },
  { value: "growth", label: "成长期" },
  { value: "overheat", label: "过热期" },
  { value: "decline", label: "衰退期" }
];

export const confidenceOptions = [
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" }
];

export function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

export function StatusTag({ status }: { status?: string | null }) {
  const color = status === "active" ? "green" : status === "paused" ? "gold" : status === "archived" ? "default" : "blue";
  const label = thesisStatusOptions.find((item) => item.value === status)?.label || status || "未知";
  return <Tag color={color}>{label}</Tag>;
}

export function DirectionTag({ direction }: { direction?: string | null }) {
  const color = direction === "support" ? "green" : direction === "weaken" ? "red" : direction === "noise" ? "default" : "blue";
  const label = direction === "support" ? "支持" : direction === "weaken" ? "削弱" : direction === "noise" ? "噪音" : "中性";
  return <Tag color={color}>{label}</Tag>;
}

export function candidateTitle(candidate: TrackCandidate) {
  return candidate.tag?.name || "未命名赛道";
}
