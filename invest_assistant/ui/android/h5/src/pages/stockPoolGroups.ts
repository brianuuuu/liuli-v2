import type { StockPoolItem } from "../types/api";

export type StockTabView = "materials" | "pool";

export const DEFAULT_STOCK_TAB_VIEW: StockTabView = "materials";

export const STOCK_TAB_VIEWS: { value: StockTabView; label: string }[] = [
  { value: "pool", label: "标的池" },
  { value: "materials", label: "标的材料" }
];

export type PoolStatusKey = "all" | "focused" | "watching" | "candidate";

/** 归档 = 软删除，等同回收站，不进"全部"也不进任何默认列表。 */
const ARCHIVED_POOL_STATUS = "archived";

/** 默认落在重点跟踪，这是日常最常看的一组。 */
export const DEFAULT_POOL_STATUS: PoolStatusKey = "focused";

/** 分组筛选项。归档在 App 上不再单独成组，回收站只在 Web 端看。 */
export const POOL_STATUS_OPTIONS: { value: PoolStatusKey; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "focused", label: "重点跟踪" },
  { value: "watching", label: "观察" },
  { value: "candidate", label: "候选" }
];

/** 状态徽章的文案口径与 Web 标的池一致，比筛选项多一个归档：详情页仍可能打开已归档的标的。 */
const POOL_STATUS_LABELS: Record<string, string> = {
  focused: "重点跟踪",
  watching: "观察",
  candidate: "候选",
  archived: "归档"
};

/** 徽章配色只认已知状态；"全部"是筛选项不是标的状态，和未知值一起走中性样式。 */
export function poolStatusTone(status?: string | null) {
  return status && status in POOL_STATUS_LABELS ? status : "unknown";
}

export function poolStatusLabel(status?: string | null) {
  return (status && POOL_STATUS_LABELS[status]) ?? status ?? "未知";
}

export function filterPoolByStatus(items: StockPoolItem[], status: PoolStatusKey = DEFAULT_POOL_STATUS) {
  return status === "all"
    ? items.filter((item) => item.status !== ARCHIVED_POOL_STATUS)
    : items.filter((item) => item.status === status);
}

/** 分组计数在端上算，因为 /pool 不返回按状态的统计。 */
export function poolStatusCounts(items: StockPoolItem[]): Record<PoolStatusKey, number> {
  return POOL_STATUS_OPTIONS.reduce((counts, option) => {
    counts[option.value] = filterPoolByStatus(items, option.value).length;
    return counts;
  }, {} as Record<PoolStatusKey, number>);
}

export type AnnualizedValuationSpace = "大" | "中" | "小";

/** 将三年总估值空间按复合增长率折算成年化，再映射为卡片角标。 */
export function annualizedValuationSpace(expectationGapRate?: number | null): AnnualizedValuationSpace | null {
  if (expectationGapRate == null || !Number.isFinite(expectationGapRate) || expectationGapRate <= -1) return null;
  const annualizedRate = Math.pow(1 + expectationGapRate, 1 / 3) - 1;
  const thresholdTolerance = 1e-12;
  if (annualizedRate > 0.2 + thresholdTolerance) return "大";
  if (annualizedRate >= 0.1 - thresholdTolerance) return "中";
  return "小";
}

/** 趋势等级只认 T0~T5（T0 最强），越界值不上角标，避免把脏数据画成一个没有配色的色块。 */
export const TREND_LEVELS = ["T0", "T1", "T2", "T3", "T4", "T5"] as const;

export type TrendLevel = (typeof TREND_LEVELS)[number];

export function trendLevelBadge(trendLevel?: string | null): TrendLevel | null {
  const normalized = trendLevel?.trim().toUpperCase();
  return TREND_LEVELS.find((level) => level === normalized) ?? null;
}

/**
 * 三个维度共用一套强/中/弱配色：颜色只编码"好到什么程度"，不编码"这是哪个维度"。
 * 各自一套色时 A 和 B 同为蓝色，等级高低反而看不出来；统一之后一张卡片红得越多越好。
 */
export type BadgeTier = "strong" | "mid" | "weak";

const INVESTMENT_LEVEL_TIERS: Record<string, BadgeTier> = {
  S: "strong",
  A: "strong",
  B: "mid",
  C: "mid",
  D: "weak"
};

const TREND_LEVEL_TIERS: Record<TrendLevel, BadgeTier> = {
  T0: "strong",
  T1: "strong",
  T2: "strong",
  T3: "mid",
  T4: "mid",
  T5: "weak"
};

const VALUATION_SPACE_TIERS: Record<AnnualizedValuationSpace, BadgeTier> = {
  大: "strong",
  中: "mid",
  小: "weak"
};

/** 评级口径之外的等级不套用档位配色，走中性样式，避免把看不懂的值画成"差"。 */
export function investmentLevelTier(investmentLevel?: string | null): BadgeTier | null {
  return INVESTMENT_LEVEL_TIERS[investmentLevel?.trim().toUpperCase() ?? ""] ?? null;
}

export function trendLevelTier(trendLevel: TrendLevel): BadgeTier {
  return TREND_LEVEL_TIERS[trendLevel];
}

export function valuationSpaceTier(space: AnnualizedValuationSpace): BadgeTier {
  return VALUATION_SPACE_TIERS[space];
}

export function badgeTierClass(tier: BadgeTier | null): string {
  return tier ? `pool-card__badge--tier-${tier}` : "";
}

/** 评级从强到弱，和 INVESTMENT_LEVEL_TIERS 同一套口径，这里多出来的是档内次序。 */
export const INVESTMENT_LEVELS = ["S", "A", "B", "C", "D"] as const;

/** 估值空间从大到小。 */
export const VALUATION_SPACES: readonly AnnualizedValuationSpace[] = ["大", "中", "小"];

/** 认不出的值排在该维度所有已知档之后：未评级的标的不能混进最强的一批里。 */
function rankIn<T>(order: readonly T[], value: T | null): number {
  const index = value == null ? -1 : order.indexOf(value);
  return index < 0 ? order.length : index;
}

export type PoolSortKey = "trend" | "level" | "space";

/** 排序按钮点一下换下一个维度，到末尾回到趋势。 */
export const POOL_SORT_OPTIONS: { value: PoolSortKey; label: string }[] = [
  { value: "trend", label: "趋势" },
  { value: "level", label: "评级" },
  { value: "space", label: "估值空间" }
];

export const DEFAULT_POOL_SORT: PoolSortKey = "trend";

export function nextPoolSort(sort: PoolSortKey): PoolSortKey {
  const index = POOL_SORT_OPTIONS.findIndex((option) => option.value === sort);
  return POOL_SORT_OPTIONS[(index + 1) % POOL_SORT_OPTIONS.length].value;
}

export function poolSortLabel(sort: PoolSortKey) {
  return POOL_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";
}

/** 选中的维度打头，其余两维按趋势 > 评级 > 估值空间的原有次序兜底。 */
const POOL_SORT_ORDERS: Record<PoolSortKey, PoolSortKey[]> = {
  trend: ["trend", "level", "space"],
  level: ["level", "trend", "space"],
  space: ["space", "trend", "level"]
};

/** 排序键与卡片角标同源，每一维都是强在前：看到的角标就是排序依据，不用再解释一遍。 */
export function poolSortKey(item: StockPoolItem, sort: PoolSortKey = DEFAULT_POOL_SORT): number[] {
  const { level, space, trend } = poolCardBadgeSet(item);
  const ranks: Record<PoolSortKey, number> = {
    trend: rankIn(TREND_LEVELS, trend),
    level: rankIn(INVESTMENT_LEVELS, (level?.toUpperCase() ?? null) as (typeof INVESTMENT_LEVELS)[number] | null),
    space: rankIn(VALUATION_SPACES, space)
  };
  return POOL_SORT_ORDERS[sort].map((key) => ranks[key]);
}

/** 三个键全相同的保持后端返回的次序：Array.prototype.sort 是稳定排序。 */
export function sortPool(items: StockPoolItem[], sort: PoolSortKey = DEFAULT_POOL_SORT): StockPoolItem[] {
  return [...items].sort((left, right) => {
    const leftKey = poolSortKey(left, sort);
    const rightKey = poolSortKey(right, sort);
    for (let index = 0; index < leftKey.length; index += 1) {
      if (leftKey[index] !== rightKey[index]) return leftKey[index] - rightKey[index];
    }
    return 0;
  });
}

export type PoolCardBadgeSet = {
  level: string | null;
  space: AnnualizedValuationSpace | null;
  trend: TrendLevel | null;
};

export function poolCardBadgeSet(item: StockPoolItem): PoolCardBadgeSet {
  return {
    level: item.investment_level?.trim() || null,
    space: annualizedValuationSpace(item.expectation_gap_rate),
    trend: trendLevelBadge(item.trend_level)
  };
}

/** 标的卡片按三列排布，最多八行；超出时最后一格让给翻页按钮。
 *  八行是照常见机型的可用高度取的：六行在高屏上会空掉小半屏，
 *  而八行把 50 条上限压到两页，翻页成本直接减半。 */
export const POOL_CARD_COLUMNS = 3;
export const POOL_CARD_MAX_ROWS = 8;
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
