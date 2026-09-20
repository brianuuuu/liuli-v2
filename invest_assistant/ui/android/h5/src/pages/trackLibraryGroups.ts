import type { TrackDetail, TrackListItem, TrackTrendSnapshot } from "../types/api";

/**
 * 赛道库的分组、排序与文案。
 * 上部按 track.status 分组（默认"全部"），组内按综合评级排序。
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

export type TrackStatusKey = "all" | "active" | "candidate" | "archived";

// 跟踪中排在候选之前：赛道库最常看的是正在跟的那几条，候选是往里补的池子。
export const TRACK_STATUS_OPTIONS: { value: TrackStatusKey; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "跟踪中" },
  { value: "candidate", label: "候选" },
  { value: ARCHIVED_TRACK_STATUS, label: "归档" }
];

/** S 排最前，没有研究结论的排最后。数字越小越靠前。 */
const GRADE_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const GRADE_UNRESEARCHED = 5;

export const TRACK_CYCLE_LABELS: Record<string, string> = { short: "短期", mid: "中期", long: "长期" };

/** 六维评分的展示顺序和中文名，详情页按这个顺序渲染，换位置只改这里。 */
export const TRACK_SCORE_DIMENSIONS = [
  { key: "market_heat_score", label: "市场热度" },
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
  /** 卡片左角标：综合评级。没有研究结论时为 null，卡片显示"待研究"。 */
  grade?: string | null;
  /** 卡片右角标：市场热度档位，T0 最热。 */
  heatTier?: string | null;
  overallScore: number | null;
  headlineCycle?: string | null;
  coreJudgment: string;
  industryPhase?: string | null;
  marketPhase?: string | null;
  heat: number | null;
  researched: boolean;
};

export type TrackHeatLookup = Record<number, number>;

/**
 * 列表接口已经带上了最新快照的评级、热度档位和综合分，snapshot 只在详情页那种
 * 手里已经有完整快照的场景传入；两边都有时以快照为准。
 */
export function buildTrackRow(
  track: TrackListItem,
  snapshot: TrackTrendSnapshot | undefined,
  heat: TrackHeatLookup
): TrackRowView {
  const grade = snapshot?.track_grade ?? track.track_grade ?? null;
  return {
    id: track.id,
    name: track.name || "未命名赛道",
    status: track.status,
    grade,
    heatTier: snapshot?.heat_tier ?? track.heat_tier ?? null,
    overallScore: snapshot?.overall_score ?? track.overall_score ?? null,
    headlineCycle: snapshot?.headline_cycle ?? track.headline_cycle ?? null,
    // 快照的核心判断优先，退回 track 上回填的当前判断，都没有才显示占位
    coreJudgment: snapshot?.core_judgment || track.current_view || "尚无研究结论",
    industryPhase: snapshot?.industry_phase || track.industry_phase || null,
    marketPhase: snapshot?.market_phase || track.market_phase || null,
    heat: heat[track.id] ?? null,
    researched: Boolean(grade)
  };
}

export function filterTracksByStatus(rows: TrackRowView[], status: TrackStatusKey): TrackRowView[] {
  if (status === ALL_TRACK_STATUS) {
    // "全部"是默认视图，归档等同软删除，不该混进来
    return rows.filter((item) => item.status !== ARCHIVED_TRACK_STATUS);
  }
  return rows.filter((item) => item.status === status);
}

/**
 * 组内排序：评级 → 综合分 → 热度 → 名称。
 * 综合分已经能完整定序，先按评级分档是为了和卡片角标看到的顺序一致。
 * 名称兜底是为了让没有任何研究结论的赛道之间顺序稳定，不随请求抖动。
 */
export function sortTracksByGrade(rows: TrackRowView[]): TrackRowView[] {
  return [...rows].sort((a, b) => {
    const grade =
      (GRADE_ORDER[a.grade || ""] ?? GRADE_UNRESEARCHED) - (GRADE_ORDER[b.grade || ""] ?? GRADE_UNRESEARCHED);
    if (grade) return grade;
    const score = (b.overallScore ?? -1) - (a.overallScore ?? -1);
    if (score) return score;
    const heat = (b.heat ?? -1) - (a.heat ?? -1);
    if (heat) return heat;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

/** 各分档的条数，显示在分组按钮上。"全部"这一档不含归档。 */
export function trackStatusCounts(rows: TrackRowView[]): Record<TrackStatusKey, number> {
  const counts: Record<TrackStatusKey, number> = {
    all: 0,
    active: 0,
    candidate: 0,
    archived: 0
  };
  for (const row of rows) {
    if (row.status === ARCHIVED_TRACK_STATUS) {
      counts.archived += 1;
      continue;
    }
    counts.all += 1;
    // 历史数据里可能还有已下线的状态码，计入"全部"但不单独开一档
    if (row.status === "active" || row.status === "candidate") {
      counts[row.status] += 1;
    }
  }
  return counts;
}

/** 详情页的六维评分行，与 Web 端同构。缺值给 null 显示占位，不补 0。 */
export function buildDetailScoreRows(snapshot?: TrackTrendSnapshot | null) {
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
