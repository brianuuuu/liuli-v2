import type { StockPoolItem } from "../types/api";

export type StockTabView = "materials" | "pool";

export const DEFAULT_STOCK_TAB_VIEW: StockTabView = "materials";

export const STOCK_TAB_VIEWS: { value: StockTabView; label: string }[] = [
  { value: "materials", label: "最新材料" },
  { value: "pool", label: "标的池" }
];

export type PoolStatusKey = "all" | "focused" | "watching" | "candidate" | "archived";

export const DEFAULT_POOL_STATUS: PoolStatusKey = "all";

/** 与 Web 标的池保持一致的状态口径。 */
export const POOL_STATUS_OPTIONS: { value: PoolStatusKey; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "focused", label: "重点跟踪" },
  { value: "watching", label: "观察" },
  { value: "candidate", label: "候选" },
  { value: "archived", label: "归档" }
];

export function poolStatusLabel(status?: string | null) {
  return POOL_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status ?? "未知";
}

export function poolStatusTone(status?: string | null) {
  if (status === "focused") return "focused";
  if (status === "watching") return "watching";
  if (status === "archived") return "archived";
  return "candidate";
}

export function filterPoolByStatus(items: StockPoolItem[], status: PoolStatusKey = DEFAULT_POOL_STATUS) {
  return status === "all" ? items : items.filter((item) => item.status === status);
}

/** 分组计数在端上算，因为 /pool 不返回按状态的统计。 */
export function poolStatusCounts(items: StockPoolItem[]): Record<PoolStatusKey, number> {
  return POOL_STATUS_OPTIONS.reduce((counts, option) => {
    counts[option.value] = filterPoolByStatus(items, option.value).length;
    return counts;
  }, {} as Record<PoolStatusKey, number>);
}

/** 移动端一行放不下多条赛道，最多展示两条，其余折叠成 +N。 */
export function poolTrackSummary(item: StockPoolItem, max = 2) {
  const names = (item.tracks ?? [])
    .filter((track) => track.status !== "archived")
    .map((track) => track.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (!names.length) return "未绑定赛道";
  const shown = names.slice(0, max).join(" · ");
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}
