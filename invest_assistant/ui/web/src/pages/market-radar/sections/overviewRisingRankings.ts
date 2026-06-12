import type { RankingType, RankingWindow } from "../../../api/marketRadar";
import type { TagHeat } from "../../../types/api";

export type RisingRankingType = Exclude<RankingType, "all">;
export type RisingRankingWindow = Extract<RankingWindow, "24h" | "7d" | "30d">;

export const risingWindows: { value: RisingRankingWindow; label: string }[] = [
  { value: "24h", label: "最近24小时" },
  { value: "7d", label: "最近7天" },
  { value: "30d", label: "最近30天" }
];

export const risingTypes: { value: RisingRankingType; label: string }[] = [
  { value: "hotword", label: "市场热词" },
  { value: "track", label: "赛道" },
  { value: "stock", label: "标的" }
];

export function risingTopRows(rows: TagHeat[], limit = 10): TagHeat[] {
  return [...rows]
    .filter((item) => item.rank_movement === "up" || item.rank_movement === "new")
    .sort((a, b) => {
      const aNew = a.rank_movement === "new" ? 1 : 0;
      const bNew = b.rank_movement === "new" ? 1 : 0;
      const byNew = aNew - bNew;
      if (byNew !== 0) return byNew;
      const byChange = Number(b.rank_change || 0) - Number(a.rank_change || 0);
      if (byChange !== 0) return byChange;
      const byHeat = Number(b.heat_score || 0) - Number(a.heat_score || 0);
      if (byHeat !== 0) return byHeat;
      const byRank = Number(a.rank_no || 0) - Number(b.rank_no || 0);
      if (byRank !== 0) return byRank;
      return Number(a.id || 0) - Number(b.id || 0);
    })
    .slice(0, limit);
}

export function coolingTopRows(rows: TagHeat[], limit = 10): TagHeat[] {
  return [...rows]
    .filter((item) => item.rank_movement === "down" && Number(item.rank_change || 0) < 0)
    .sort((a, b) => {
      const byChange = Number(a.rank_change || 0) - Number(b.rank_change || 0);
      if (byChange !== 0) return byChange;
      const byHeat = Number(b.heat_score || 0) - Number(a.heat_score || 0);
      if (byHeat !== 0) return byHeat;
      const byRank = Number(a.rank_no || 0) - Number(b.rank_no || 0);
      if (byRank !== 0) return byRank;
      return Number(a.id || 0) - Number(b.id || 0);
    })
    .slice(0, limit);
}

export function formatRankMovement(value: Pick<TagHeat, "rank_change" | "rank_movement">): string {
  if (value.rank_movement === "new") return "新进";
  const next = Number(value.rank_change || 0);
  if (!next) return "持平";
  return next > 0 ? `↑ ${next}` : `↓ ${Math.abs(next)}`;
}

export function rankMovementClass(value: Pick<TagHeat, "rank_change" | "rank_movement">): string {
  if (value.rank_movement === "new") return "up";
  const next = Number(value.rank_change || 0);
  if (next > 0) return "up";
  if (next < 0) return "down";
  return "";
}
