import type { StockPoolItem } from "../types/api";

export type StockTabView = "materials" | "pool";

export const DEFAULT_STOCK_TAB_VIEW: StockTabView = "materials";

export const STOCK_TAB_VIEWS: { value: StockTabView; label: string }[] = [
  { value: "materials", label: "重要材料" },
  { value: "pool", label: "标的池" }
];

export type PoolStatusKey = "all" | "focused" | "watching" | "candidate" | "archived";

/** 默认落在重点跟踪，这是日常最常看的一组。 */
export const DEFAULT_POOL_STATUS: PoolStatusKey = "focused";

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

/** 卡片一行放不下多条赛道，只展示一条，其余折叠成 +N；没有绑定赛道时返回空串，由调用方不渲染。 */
export function poolTrackSummary(item: StockPoolItem, max = 1) {
  const names = (item.tracks ?? [])
    .filter((track) => track.status !== "archived")
    .map((track) => track.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (!names.length) return "";
  const shown = names.slice(0, max).join(" · ");
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}
