import type { TagHeat } from "../../../types/api";

const TAG_TYPE_LABELS: Record<string, string> = {
  hotword: "市场热词",
  stock: "标的",
  track: "赛道",
  general: "通用"
};

export function filterRankingRows(rows: TagHeat[], query: string): TagHeat[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return rows;

  return rows.filter((item) => {
    const type = item.tag?.type || "";
    const searchable = [
      item.tag?.name,
      item.tag_id,
      item.rank_no,
      type,
      type ? TAG_TYPE_LABELS[type] : undefined
    ]
      .filter((value) => value !== undefined && value !== null)
      .join(" ")
      .toLowerCase();

    return searchable.includes(keyword);
  });
}
