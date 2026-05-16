import { Typography } from "antd";

export function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

export function compactText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DetailRows({ record }: { record: Record<string, unknown> }) {
  return (
    <div className="detail-list">
      {Object.entries(record).map(([key, value]) => (
        <div className="detail-row" key={key}>
          <Typography.Text type="secondary">{key}</Typography.Text>
          <Typography.Text>{compactText(value)}</Typography.Text>
        </div>
      ))}
    </div>
  );
}

export function parseJsonObject(text: string) {
  const value = text.trim();
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("请输入 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}
