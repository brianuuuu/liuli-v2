import type { TrackDetail, TrackListItem, TrackTrendSnapshot } from "../types/api";

/**
 * 赛道库的分组、排序与文案。
 * 上部按 track.status 分组（默认"全部"），组内按研究优先级分档排序。
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

export type TrackStatusKey = "all" | "candidate" | "active" | "paused" | "archived";

export const TRACK_STATUS_OPTIONS: { value: TrackStatusKey; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "candidate", label: "候选" },
  { value: "active", label: "跟踪中" },
  { value: "paused", label: "暂停观察" },
  { value: ARCHIVED_TRACK_STATUS, label: "归档" }
];

/** 优先研究排最前，没有研究结论的排最后。数字越小越靠前。 */
const PRIORITY_ORDER: Record<string, number> = {
  priority: 0,
  tracking: 1,
  deprioritized: 2
};
const PRIORITY_UNRESEARCHED = 3;

const STRENGTH_ORDER: Record<string, number> = {
  strong: 0,
  medium: 1,
  weak: 2,
  insufficient: 3
};

export const TRACK_CYCLE_LABELS: Record<string, string> = { short: "短期", mid: "中期", long: "长期" };
export const TRACK_STRENGTH_LABELS: Record<string, string> = {
  strong: "强",
  medium: "中",
  weak: "弱",
  insufficient: "证据不足"
};
export const TRACK_DIRECTION_LABELS: Record<string, string> = {
  strengthening: "强化",
  stable: "平稳",
  weakening: "弱化"
};
export const TRACK_PRIORITY_LABELS: Record<string, string> = {
  priority: "优先研究",
  tracking: "持续跟踪",
  deprioritized: "降低关注"
};
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
  headlineStrength?: string | null;
  headlineCycle?: string | null;
  researchPriority?: string | null;
  coreJudgment: string;
  industryPhase?: string | null;
  marketPhase?: string | null;
  heat: number | null;
  researched: boolean;
};

export type TrackHeatLookup = Record<number, number>;

export function buildTrackRow(
  track: TrackListItem,
  snapshot: TrackTrendSnapshot | undefined,
  heat: TrackHeatLookup
): TrackRowView {
  return {
    id: track.id,
    name: track.name || "未命名赛道",
    status: track.status,
    headlineStrength: snapshot?.headline_strength ?? null,
    headlineCycle: snapshot?.headline_cycle ?? null,
    researchPriority: snapshot?.research_priority ?? null,
    // 快照的核心判断优先，退回 track 上回填的当前判断，都没有才显示占位
    coreJudgment: snapshot?.core_judgment || track.current_view || "尚无研究结论",
    industryPhase: snapshot?.industry_phase || track.industry_phase || null,
    marketPhase: snapshot?.market_phase || track.market_phase || null,
    heat: heat[track.id] ?? null,
    researched: Boolean(snapshot)
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
 * 组内排序：研究优先级 → 强度 → 热度 → 名称。
 * 名称兜底是为了让没有任何研究结论的赛道之间顺序稳定，不随请求抖动。
 */
export function sortTracksByPriority(rows: TrackRowView[]): TrackRowView[] {
  return [...rows].sort((a, b) => {
    const priority =
      (PRIORITY_ORDER[a.researchPriority || ""] ?? PRIORITY_UNRESEARCHED) -
      (PRIORITY_ORDER[b.researchPriority || ""] ?? PRIORITY_UNRESEARCHED);
    if (priority) return priority;
    const strength =
      (STRENGTH_ORDER[a.headlineStrength || ""] ?? STRENGTH_ORDER.insufficient + 1) -
      (STRENGTH_ORDER[b.headlineStrength || ""] ?? STRENGTH_ORDER.insufficient + 1);
    if (strength) return strength;
    const heat = (b.heat ?? -1) - (a.heat ?? -1);
    if (heat) return heat;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

/** 各分档的条数，显示在分组按钮上。"全部"这一档不含归档。 */
export function trackStatusCounts(rows: TrackRowView[]): Record<TrackStatusKey, number> {
  const counts: Record<TrackStatusKey, number> = {
    all: 0,
    candidate: 0,
    active: 0,
    paused: 0,
    archived: 0
  };
  for (const row of rows) {
    if (row.status === ARCHIVED_TRACK_STATUS) {
      counts.archived += 1;
      continue;
    }
    counts.all += 1;
    if (row.status === "candidate" || row.status === "active" || row.status === "paused") {
      counts[row.status] += 1;
    }
  }
  return counts;
}

/** 详情页概览要的三周期行，与 Web 端同构。 */
export function buildDetailCycleRows(snapshot?: TrackTrendSnapshot | null) {
  return [
    { key: "short", label: "短期", strength: snapshot?.short_strength, direction: snapshot?.short_direction, basis: snapshot?.short_basis },
    { key: "mid", label: "中期", strength: snapshot?.mid_strength, direction: snapshot?.mid_direction, basis: snapshot?.mid_basis },
    { key: "long", label: "长期", strength: snapshot?.long_strength, direction: snapshot?.long_direction, basis: snapshot?.long_basis }
  ].map((row) => ({ ...row, isHeadline: snapshot?.headline_cycle === row.key }));
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

export function activeStockCount(detail: TrackDetail): number {
  return detail.stocks.filter((item) => item.status === "active").length;
}
