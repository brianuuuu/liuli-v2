import { Tag } from "antd";
import type { TrackCandidate, TrackThesis } from "../../../types/api";

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
  const color = direction === "positive" ? "green" : direction === "negative" ? "red" : "gold";
  return <Tag color={color}>{direction || "neutral"}</Tag>;
}

export function candidateTitle(candidate: TrackCandidate) {
  return candidate.tag?.name || "未命名赛道";
}

export function thesisToRecord(thesis: TrackThesis) {
  return thesis as unknown as Record<string, unknown>;
}
