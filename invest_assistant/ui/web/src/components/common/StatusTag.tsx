import { Tag } from "antd";

const colorByStatus: Record<string, string> = {
  active: "green",
  enabled: "green",
  pending: "gold",
  running: "blue",
  failed: "red",
  archived: "default",
  disabled: "default",
  handled: "green",
  read: "green",
  unread: "red"
};

export function StatusTag({ status }: { status?: string | null }) {
  const value = status || "unknown";
  return <Tag color={colorByStatus[value] || "blue"}>{value}</Tag>;
}
