import { Tag } from "antd";

const colorByStatus: Record<string, string> = {
  active: "green",
  enabled: "green",
  pending: "gold",
  approved: "green",
  merged: "blue",
  rejected: "red",
  running: "blue",
  failed: "red",
  archived: "default",
  disabled: "default",
  handled: "green",
  read: "green",
  unread: "red"
};

export function StatusTag({ status, label }: { status?: string | null; label?: string }) {
  const value = status || "unknown";
  return <Tag color={colorByStatus[value] || "blue"}>{label || value}</Tag>;
}
