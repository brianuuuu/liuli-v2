import { Tag } from "antd";
import type { TrackCandidate, TrackThesis } from "../../../types/api";

export const trackWindowOptions = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" }
];

export const thesisStatusOptions = [
  { value: "watching", label: "watching" },
  { value: "validated", label: "validated" },
  { value: "rejected", label: "rejected" },
  { value: "archived", label: "archived" }
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
  const color = status === "validated" ? "green" : status === "rejected" ? "red" : status === "archived" ? "default" : "blue";
  return <Tag color={color}>{status || "unknown"}</Tag>;
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
