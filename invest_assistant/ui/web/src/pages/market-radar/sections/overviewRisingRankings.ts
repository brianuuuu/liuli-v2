import type { RankingType, RankingWindow } from "../../../api/marketRadar";
import type { TagHeat } from "../../../types/api";

export type RisingRankingType = Exclude<RankingType, "all">;
export type RisingRankingWindow = Extract<RankingWindow, "7d" | "30d" | "90d">;

export const risingWindows: { value: RisingRankingWindow; label: string }[] = [
  { value: "7d", label: "最近7天" },
  { value: "30d", label: "最近30天" },
  { value: "90d", label: "最近90天" }
];

export const risingTypes: { value: RisingRankingType; label: string }[] = [
  { value: "hotword", label: "市场热词" },
  { value: "track", label: "赛道" },
  { value: "stock", label: "标的" }
];

export function risingTopRows(rows: TagHeat[], limit = 5): TagHeat[] {
  return [...rows]
    .sort((a, b) => {
      const byChange = Number(b.change_ratio || 0) - Number(a.change_ratio || 0);
      if (byChange !== 0) return byChange;
      const byHeat = Number(b.heat_score || 0) - Number(a.heat_score || 0);
      if (byHeat !== 0) return byHeat;
      const byRank = Number(a.rank_no || 0) - Number(b.rank_no || 0);
      if (byRank !== 0) return byRank;
      return Number(a.id || 0) - Number(b.id || 0);
    })
    .slice(0, limit);
}

export function coolingTopRows(rows: TagHeat[], limit = 5): TagHeat[] {
  return [...rows]
    .sort((a, b) => {
      const byChange = Number(a.change_ratio || 0) - Number(b.change_ratio || 0);
      if (byChange !== 0) return byChange;
      const byHeat = Number(b.heat_score || 0) - Number(a.heat_score || 0);
      if (byHeat !== 0) return byHeat;
      const byRank = Number(a.rank_no || 0) - Number(b.rank_no || 0);
      if (byRank !== 0) return byRank;
      return Number(a.id || 0) - Number(b.id || 0);
    })
    .slice(0, limit);
}

export function formatRisePercent(value?: number | null): string {
  const next = Number(value || 0);
  if (!next) return "0%";
  return `${next > 0 ? "+" : ""}${(next * 100).toFixed(0)}%`;
}

export function riseClass(value?: number | null): string {
  const next = Number(value || 0);
  if (next > 0) return "up";
  if (next < 0) return "down";
  return "";
}
