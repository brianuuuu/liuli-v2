import type { TrackMaterial } from "../../../types/api";

export type MaterialStatusFilter = "pending" | "confirmed" | "ignored" | "all";

export type MaterialDateGroup = {
  date: string;
  items: TrackMaterial[];
};

export const materialStatusOptions: Array<{ value: MaterialStatusFilter; label: string }> = [
  { value: "pending", label: "待处理" },
  { value: "confirmed", label: "已确认" },
  { value: "ignored", label: "已忽略" },
  { value: "all", label: "全部" },
];

export const materialTypeOptions = [
  { value: "source_item", label: "信息流" },
  { value: "knowledge_note", label: "知识笔记" },
];

export const materialDirectionOptions = [
  { value: "support", label: "支持" },
  { value: "weaken", label: "削弱" },
  { value: "neutral", label: "中性" },
  { value: "noise", label: "噪声" },
];

export const materialImportanceOptions = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

export function materialTime(material: Pick<TrackMaterial, "updated_at" | "created_at">) {
  return material.updated_at || material.created_at || "";
}

export function materialDate(material: Pick<TrackMaterial, "updated_at" | "created_at">) {
  const value = materialTime(material);
  return value ? value.slice(0, 10) : "未注明日期";
}

export function sortMaterialsByTime(rows: TrackMaterial[]) {
  return [...rows].sort((a, b) => materialTime(b).localeCompare(materialTime(a)) || b.id - a.id);
}

export function filterMaterialsByStatus(rows: TrackMaterial[], status: MaterialStatusFilter) {
  const filtered = status === "all" ? rows : rows.filter((item) => item.status === status);
  return sortMaterialsByTime(filtered);
}

export function pendingMaterials(rows: TrackMaterial[]) {
  return filterMaterialsByStatus(rows, "pending");
}

export function timelineMaterials(rows: TrackMaterial[], status: MaterialStatusFilter) {
  const scoped = status === "all" ? rows : rows.filter((item) => item.status === status);
  return sortMaterialsByTime(scoped.filter((item) => item.status !== "pending"));
}

export function groupMaterialsByDate(rows: TrackMaterial[]): MaterialDateGroup[] {
  const groups = new Map<string, TrackMaterial[]>();
  for (const item of sortMaterialsByTime(rows)) {
    const date = materialDate(item);
    groups.set(date, [...(groups.get(date) || []), item]);
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

export function compactMaterialSummary(
  material: Pick<TrackMaterial, "material_summary" | "material_title" | "note">,
  limit = 48
) {
  const text = String(material.material_summary || material.material_title || material.note || "暂无材料摘要").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

export function materialStatusLabel(status?: string | null) {
  return materialStatusOptions.find((item) => item.value === status)?.label || status || "-";
}

export function materialTypeLabel(type?: string | null) {
  return materialTypeOptions.find((item) => item.value === type)?.label || type || "-";
}

export function materialDirectionLabel(direction?: string | null) {
  return materialDirectionOptions.find((item) => item.value === direction)?.label || direction || "-";
}

export function materialImportanceLabel(level?: string | null) {
  return materialImportanceOptions.find((item) => item.value === level)?.label || level || "-";
}
