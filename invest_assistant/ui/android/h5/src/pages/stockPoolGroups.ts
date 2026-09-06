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

/** 徽章配色只认已知状态；"全部"是筛选项不是标的状态，和未知值一起走中性样式。 */
export function poolStatusTone(status?: string | null) {
  return POOL_STATUS_OPTIONS.some((option) => option.value === status && option.value !== "all")
    ? String(status)
    : "unknown";
}

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

/** 标的卡片按三列排布，最多六行；超出时最后一格让给翻页按钮。 */
export const POOL_CARD_COLUMNS = 3;
export const POOL_CARD_MAX_ROWS = 6;
export const POOL_PAGE_CAPACITY = POOL_CARD_COLUMNS * POOL_CARD_MAX_ROWS;

export type PoolPageLayout = {
  cards: StockPoolItem[];
  page: number;
  totalPages: number;
  showPager: boolean;
};

export function poolPageLayout(items: StockPoolItem[], page = 0): PoolPageLayout {
  if (items.length <= POOL_PAGE_CAPACITY) {
    return { cards: items, page: 0, totalPages: 1, showPager: false };
  }
  const pageSize = POOL_PAGE_CAPACITY - 1;
  const totalPages = Math.ceil(items.length / pageSize);
  const safePage = ((page % totalPages) + totalPages) % totalPages;
  const start = safePage * pageSize;
  return { cards: items.slice(start, start + pageSize), page: safePage, totalPages, showPager: true };
}

/** 翻到最后一页后循环回第一页，避免出现点不动的死角。 */
export function nextPoolPage(page: number, totalPages: number) {
  return totalPages <= 1 ? 0 : (page + 1) % totalPages;
}
