import type { EChartsOption } from "echarts";
import type {
  TrackDataSource,
  TrackScenario,
  TrackSegment,
  TrackTrendSnapshot
} from "../../types/api";

/**
 * 赛道趋势快照的展示层。把 34 个字段的取值、排序和降级逻辑集中在这里，
 * 页面只负责摆位置。枚举码到中文的映射在 sections/shared.tsx，那边同时供列表和表单使用。
 */

/** 强度是序数不是分数：强 3 / 中 2 / 弱 1 / 证据不足 0，只用来画相对走势。 */
export const STRENGTH_LEVEL: Record<string, number> = {
  strong: 3,
  medium: 2,
  weak: 1,
  insufficient: 0
};

export const STRENGTH_AXIS_LABELS = ["证据不足", "弱", "中", "强"] as const;

export type StrengthTone = "strong" | "medium" | "weak" | "unknown";

export function strengthTone(value?: string | null): StrengthTone {
  if (value === "strong") return "strong";
  if (value === "medium") return "medium";
  if (value === "weak") return "weak";
  return "unknown";
}

/** JSON 列存的是报告原文，解析失败不能让整页白屏，降级成空数组由调用方显示占位。 */
function parseJsonColumn<T>(raw?: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function parseSegments(raw?: string | null): TrackSegment[] {
  return parseJsonColumn<TrackSegment>(raw).filter((item) => item && typeof item.segment === "string");
}

export function parseScenarios(raw?: string | null): TrackScenario[] {
  return parseJsonColumn<TrackScenario>(raw).filter((item) => item && typeof item.name === "string");
}

export function parseDataSources(raw?: string | null): TrackDataSource[] {
  return parseJsonColumn<TrackDataSource>(raw).filter((item) => item && typeof item.type === "string");
}

/** 受益在前、承压在后：报告里两类常混在一个数组里，展示时要分开看。 */
export function splitSegments(raw?: string | null) {
  const all = parseSegments(raw);
  return {
    benefiting: all.filter((item) => item.stance === "benefiting"),
    pressured: all.filter((item) => item.stance === "pressured")
  };
}

/** 基准 / 乐观 / 不利固定顺序，报告里顺序可能是乱的。 */
const SCENARIO_ORDER = ["base", "bull", "bear"] as const;

export function orderScenarios(raw?: string | null): TrackScenario[] {
  const all = parseScenarios(raw);
  return [...all].sort((a, b) => SCENARIO_ORDER.indexOf(a.name) - SCENARIO_ORDER.indexOf(b.name));
}

export type CycleRow = {
  key: "short" | "mid" | "long";
  label: string;
  horizon: string;
  strength?: string | null;
  direction?: string | null;
  basis?: string | null;
  isHeadline: boolean;
};

/**
 * 三周期判断表。headline 那一行要标出来：卡片上的"强 · 长期"说的是这一行，
 * 不代表另外两个周期也是这个强度。
 */
export function buildCycleRows(snapshot?: Partial<TrackTrendSnapshot> | null): CycleRow[] {
  const headline = snapshot?.headline_cycle;
  return [
    {
      key: "short",
      label: "短期",
      horizon: "1—3 个月",
      strength: snapshot?.short_strength,
      direction: snapshot?.short_direction,
      basis: snapshot?.short_basis,
      isHeadline: headline === "short"
    },
    {
      key: "mid",
      label: "中期",
      horizon: "6—12 个月",
      strength: snapshot?.mid_strength,
      direction: snapshot?.mid_direction,
      basis: snapshot?.mid_basis,
      isHeadline: headline === "mid"
    },
    {
      key: "long",
      label: "长期",
      horizon: "2—3 年",
      strength: snapshot?.long_strength,
      direction: snapshot?.long_direction,
      basis: snapshot?.long_basis,
      isHeadline: headline === "long"
    }
  ];
}

export type AnalysisCell = { key: string; label: string; hint: string; value?: string | null };

/** 六项核心分析，固定框架固定顺序，缺哪项就显示占位，不让格子塌掉。 */
export function buildAnalysisCells(snapshot?: Partial<TrackTrendSnapshot> | null): AnalysisCell[] {
  return [
    { key: "demand_space", label: "需求与产业空间", hint: "渗透率、成本拐点、可兑现需求", value: snapshot?.demand_space },
    { key: "supply_competition", label: "供给与竞争格局", hint: "产能、扩产周期、壁垒与议价权", value: snapshot?.supply_competition },
    { key: "profit_cashflow", label: "盈利与现金兑现", hint: "订单转化、回款、资本开支与折旧", value: snapshot?.profit_cashflow },
    { key: "policy_catalyst", label: "政策与催化", hint: "实施条件、资金落地、交付验证", value: snapshot?.policy_catalyst },
    { key: "market_capital", label: "市场与资金认可", hint: "相对强度、成交持续性、拥挤度", value: snapshot?.market_capital },
    { key: "pricing_expectation_gap", label: "定价与预期差", hint: "主流假设、尚未反映的变化、反向风险", value: snapshot?.pricing_expectation_gap }
  ];
}

export function buildSnapshotSummary(snapshot?: Partial<TrackTrendSnapshot> | null) {
  if (!snapshot) return null;
  return {
    researchDate: snapshot.research_date || null,
    researcherCode: snapshot.researcher_code || null,
    reportId: snapshot.report_id ?? null,
    headlineCycle: snapshot.headline_cycle || null,
    headlineStrength: snapshot.headline_strength || null,
    researchPriority: snapshot.research_priority || null,
    priorityRank: snapshot.priority_rank ?? null,
    confidenceLevel: snapshot.confidence_level || null,
    industryPhase: snapshot.industry_phase || null,
    marketPhase: snapshot.market_phase || null,
    coreJudgment: snapshot.core_judgment || null,
    keyContradiction: snapshot.key_contradiction || null,
    nextVerification: snapshot.next_verification || null,
    riskFalsification: snapshot.risk_falsification || null,
    changeVsLast: snapshot.change_vs_last || null,
    dataGaps: snapshot.data_gaps || null
  };
}

/** 有没有实质研究内容，用来决定是显示正文还是显示"尚无研究结论"。 */
export function hasResearchContent(snapshot?: Partial<TrackTrendSnapshot> | null): boolean {
  if (!snapshot) return false;
  const cells = buildAnalysisCells(snapshot);
  if (cells.some((item) => item.value)) return true;
  if (snapshot.core_judgment || snapshot.key_contradiction) return true;
  return splitSegments(snapshot.segments_json).benefiting.length > 0;
}

type StrengthRow = Pick<
  TrackTrendSnapshot,
  "research_date" | "short_strength" | "mid_strength" | "long_strength"
>;

/**
 * 三周期强度随时间的走势。纵轴是序数刻度不是分数，所以刻度标签直接写中文，
 * 避免读成"3 分"。同一天多份快照全部保留，横轴按日期排。
 */
export function buildStrengthTimelineOption(
  rows: StrengthRow[],
  mode: "light" | "dark",
  palette: { text: string; grid: string }
): EChartsOption {
  const ordered = [...rows]
    .filter((item) => item.research_date)
    .sort((a, b) => String(a.research_date).localeCompare(String(b.research_date)));
  const level = (value?: string | null) => (value ? STRENGTH_LEVEL[value] ?? null : null);
  return {
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: palette.text } },
    grid: { left: 68, right: 18, top: 36, bottom: 30 },
    xAxis: {
      type: "category",
      data: ordered.map((item) => item.research_date),
      axisLabel: { color: palette.text },
      axisLine: { lineStyle: { color: palette.grid } },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 3,
      interval: 1,
      axisLabel: {
        color: palette.text,
        formatter: (value: number) => STRENGTH_AXIS_LABELS[value] ?? ""
      },
      splitLine: { lineStyle: { color: palette.grid } }
    },
    series: [
      { name: "短期", type: "line", smooth: true, connectNulls: true, data: ordered.map((item) => level(item.short_strength)) },
      { name: "中期", type: "line", smooth: true, connectNulls: true, data: ordered.map((item) => level(item.mid_strength)) },
      { name: "长期", type: "line", smooth: true, connectNulls: true, data: ordered.map((item) => level(item.long_strength)) }
    ],
    darkMode: mode === "dark"
  };
}
