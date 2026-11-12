import type { TrackCycle, TrackCycleView, TrackDetail, TrackListItem, TrackTrendSnapshot, TrackTrendSnapshotBrief } from "../types/api";

/**
 * 赛道库的分组、排序与文案。
 * 按状态分组，单按钮循环切换评分、资金热度与三周期判断排序。
 *
 * 评级和热度档位的阈值只在后端 scoring.py 一份，这里一律读接口下发的 track_grade /
 * heat_tier，不在前端按分数重算。
 */

export type TrackTabView = "library" | "materials";

export const TRACK_TAB_VIEWS: { value: TrackTabView; label: string }[] = [
  { value: "library", label: "赛道库" },
  { value: "materials", label: "赛道材料" }
];

// 与标的页一致：分段顺序是「库在左、材料在右」，但落地默认停在材料流。
// 材料是"今天有什么新东西"，赛道库是主动去翻的，切过去会被记住。
export const DEFAULT_TRACK_TAB_VIEW: TrackTabView = "materials";
export const DEFAULT_TRACK_STATUS: TrackStatusKey = "all";

export const ARCHIVED_TRACK_STATUS = "archived";
export const ALL_TRACK_STATUS = "all";

export type TrackStatusKey = "all" | "active" | "candidate";

// 跟踪中排在候选之前：赛道库最常看的是正在跟的那几条，候选是往里补的池子。
// 归档不在这里出现：它等同软删除，移动端不做回收站，要翻归档去 Web 端。
export const TRACK_STATUS_OPTIONS: { value: TrackStatusKey; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "跟踪中" },
  { value: "candidate", label: "候选" }
];

const HEAT_TIER_ORDER: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };
const DIRECTION_ORDER: Record<TrackCycleView["direction"], number> = { positive: 0, neutral: 1, negative: 2, uncertain: 3 };

export type TrackSortKey = "score" | "heat" | TrackCycle;

const TRACK_SORT_OPTIONS: { value: TrackSortKey; label: string }[] = [
  { value: "score", label: "评分" },
  { value: "heat", label: "热度" },
  { value: "short", label: "短期" },
  { value: "mid", label: "中期" },
  { value: "long", label: "长期" }
];

export const DEFAULT_TRACK_SORT: TrackSortKey = "score";

export function nextTrackSort(key: TrackSortKey): TrackSortKey {
  const index = TRACK_SORT_OPTIONS.findIndex((option) => option.value === key);
  return TRACK_SORT_OPTIONS[(index + 1) % TRACK_SORT_OPTIONS.length].value;
}

export function trackSortLabel(key: TrackSortKey): string {
  return TRACK_SORT_OPTIONS.find((option) => option.value === key)!.label;
}

export const TRACK_CYCLE_LABELS: Record<string, string> = { short: "短期", mid: "中期", long: "长期" };
export const TRACK_CYCLE_DIRECTIONS: Record<TrackCycleView["direction"], string> = {
  positive: "偏强", neutral: "中性", negative: "偏弱", uncertain: "待验证"
};

/** 六维评分的展示顺序和中文名，详情页按这个顺序渲染，换位置只改这里。 */
export const TRACK_SCORE_DIMENSIONS = [
  { key: "market_heat_score", label: "资金热度" },
  { key: "growth_speed_score", label: "发展速度" },
  { key: "concentration_score", label: "行业集中度" },
  { key: "cycle_resilience_score", label: "周期韧性" },
  { key: "current_market_size_score", label: "当前市场规模" },
  { key: "future_market_size_score", label: "远期市场规模" }
] as const;

export const TRACK_SCORE_MAX = 10;

export const TRACK_INDUSTRY_PHASE_LABELS: Record<string, string> = {
  intro: "导入",
  expansion: "扩张",
  mature: "成熟",
  contraction: "收缩"
};
export const TRACK_MARKET_PHASE_LABELS: Record<string, string> = {
  latent: "潜伏",
  start: "启动",
  ferment: "发酵",
  accelerate: "加速",
  climax: "高潮",
  divergence: "分歧",
  recede: "退潮"
};

export function trackLabel(map: Record<string, string>, value?: string | null, fallback = "—") {
  if (!value) return fallback;
  return map[value] ?? value;
}

/** 列表行要展示的一切，都在这里算好，组件只摆位置。 */
export type TrackRowView = {
  id: number;
  name: string;
  status: string;
  /** 综合评级与资金热度档位并排显示在卡片右上角。 */
  grade?: string | null;
  /** 卡片右角标：资金热度档位，T0 最热。 */
  heatTier?: string | null;
  overallScore: number | null;
  cycleViews: Partial<Record<TrackCycle, TrackCycleView>>;
  coreJudgment: string;
  industryPhase?: string | null;
  marketPhase?: string | null;
  researched: boolean;
};

/** 列表接口分别聚合最新有效评分和各周期判断，直接使用，避免被单份快照覆盖。 */
export function buildTrackRow(track: TrackListItem): TrackRowView {
  const grade = track.track_grade ?? null;
  return {
    id: track.id,
    name: track.name || "未命名赛道",
    status: track.status,
    grade,
    heatTier: track.heat_tier ?? null,
    overallScore: track.overall_score ?? null,
    cycleViews: track.cycle_views ?? {},
    coreJudgment: track.current_view || "尚无研究结论",
    industryPhase: track.industry_phase || null,
    marketPhase: track.market_phase || null,
    researched: Boolean(grade)
  };
}

export function filterTracksByStatus(rows: TrackRowView[], status: TrackStatusKey): TrackRowView[] {
  // 归档等同软删除，任何分档都不显示。列表接口默认也不返回归档，这里是第二道：
  // 接口口径一旦变化，端上不至于悄悄把回收站里的赛道混进"全部"。
  const visible = rows.filter((item) => item.status !== ARCHIVED_TRACK_STATUS);
  if (status === ALL_TRACK_STATUS) return visible;
  return visible.filter((item) => item.status === status);
}

/** 名称兜底：让没有任何研究结论的赛道之间顺序稳定，不随请求抖动。 */
function byName(a: TrackRowView, b: TrackRowView) {
  return a.name.localeCompare(b.name, "zh-Hans-CN");
}

function byScore(a: TrackRowView, b: TrackRowView) {
  return (b.overallScore ?? -1) - (a.overallScore ?? -1) || byName(a, b);
}

function directionOrder(row: TrackRowView, cycle: TrackCycle) {
  const direction = row.cycleViews[cycle]?.direction;
  return direction ? DIRECTION_ORDER[direction] ?? 4 : 4;
}

/** 缺值排最后；同资金档位或同周期方向按综合分、名称稳定排序。 */
export function sortTracks(rows: TrackRowView[], key: TrackSortKey): TrackRowView[] {
  return [...rows].sort((a, b) => {
    if (key === "heat") {
      return (HEAT_TIER_ORDER[a.heatTier ?? ""] ?? 5) - (HEAT_TIER_ORDER[b.heatTier ?? ""] ?? 5) || byScore(a, b);
    }
    if (key !== "score") return directionOrder(a, key) - directionOrder(b, key) || byScore(a, b);
    return byScore(a, b);
  });
}

/** 各分档的条数，显示在分组按钮上。归档不计入任何一档。 */
export function trackStatusCounts(rows: TrackRowView[]): Record<TrackStatusKey, number> {
  const counts: Record<TrackStatusKey, number> = {
    all: 0,
    active: 0,
    candidate: 0
  };
  for (const row of rows) {
    if (row.status === ARCHIVED_TRACK_STATUS) continue;
    counts.all += 1;
    // 历史数据里可能还有已下线的状态码，计入"全部"但不单独开一档
    if (row.status === "active" || row.status === "candidate") {
      counts[row.status] += 1;
    }
  }
  return counts;
}

/**
 * 详情页的六维评分行，与 Web 端同构。缺值给 null 显示占位，不补 0。
 * 简表和完整快照都能传：这里只读六个分数列，两者都有。
 */
export function buildDetailScoreRows(snapshot?: TrackTrendSnapshotBrief | TrackTrendSnapshot | null) {
  return TRACK_SCORE_DIMENSIONS.map((item) => {
    const value = snapshot?.[item.key];
    return { key: item.key, label: item.label, value: typeof value === "number" ? value : null };
  });
}

export type TrackSegmentView = {
  segment: string;
  stance?: string;
  reason?: string | null;
  constraint?: string | null;
  representative_stocks?: string[];
};

/** JSON 列存的是报告原文，解析失败降级成空数组，不能让详情页白屏。 */
export function parseTrackSegments(raw?: string | null): TrackSegmentView[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.segment === "string");
  } catch {
    return [];
  }
}

/**
 * 下面几个取数一律对缺字段做兜底。
 * 这是 WebView：详情页渲染时抛一次异常会把整个外壳连同返回按钮一起带走，
 * 用户既看不到内容也退不出去。接口形状对不上时宁可显示 0 和空列表。
 */
export function activeStockCount(detail: TrackDetail): number {
  if (!Array.isArray(detail?.stocks)) return 0;
  return detail.stocks.filter((item) => item.status === "active").length;
}

/** track 本身也可能缺：详情接口路径写错时返回的是扁平对象，没有 track 这一层。 */
export function detailTrack(detail: TrackDetail): Partial<TrackListItem> {
  if (detail?.track && typeof detail.track === "object") return detail.track;
  // 扁平响应里赛道字段就在顶层，尽量还原出名称，至少让页面有个标题
  return (detail as unknown as Partial<TrackListItem>) ?? {};
}

export function detailStocks(detail: TrackDetail) {
  return Array.isArray(detail?.stocks) ? detail.stocks : [];
}

export function detailMaterials(detail: TrackDetail) {
  return Array.isArray(detail?.materials) ? detail.materials : [];
}

export function detailSnapshots(detail: TrackDetail) {
  return Array.isArray(detail?.trend_snapshots) ? detail.trend_snapshots : [];
}

export function detailCount(detail: TrackDetail, key: "pending_material_count" | "bound_stock_count"): number {
  const value = detail?.summary?.[key];
  return typeof value === "number" ? value : 0;
}

export function detailHeat(detail: TrackDetail): number | null {
  const value = detail?.summary?.latest_heat_score;
  return typeof value === "number" ? value : null;
}

/** 资讯热度的环比，相对一天前的同一个 7d 窗口。没有参照点时为 null，不补 0。 */
export function detailHeatChange(detail: TrackDetail): number | null {
  const value = detail?.summary?.heat_change;
  return typeof value === "number" ? value : null;
}

/** 环比展示成 +8 / -3，0 也要显示出来：持平和"没有参照点"是两回事。 */
export function heatChangeText(change: number | null): string | null {
  if (change === null) return null;
  const rounded = Math.round(change);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}
