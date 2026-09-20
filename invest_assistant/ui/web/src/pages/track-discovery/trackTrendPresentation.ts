import type { EChartsOption } from "echarts";
import type {
  TrackDataSource,
  TrackScenario,
  TrackSegment,
  TrackTrendSnapshot
} from "../../types/api";

/**
 * 赛道趋势快照的展示层。把字段的取值、排序和降级逻辑集中在这里，页面只负责摆位置。
 * 枚举码到中文的映射在 sections/shared.tsx，那边同时供列表和表单使用。
 *
 * 评级和热度档位的阈值只在后端 scoring.py 一份，这里一律读后端下发的 track_grade /
 * heat_tier，不在前端重算——前端算一遍就会出现改了阈值但页面还按老档位显示的情况。
 */

/** 六维评分的展示顺序和中文名。顺序固定，雷达图和明细表共用，换位置只改这里。 */
export const TRACK_SCORE_DIMENSIONS = [
  { key: "market_heat_score", label: "市场热度", hint: "资金与叙事当前的关注程度" },
  { key: "growth_speed_score", label: "发展速度", hint: "产业与需求的扩张斜率" },
  { key: "concentration_score", label: "行业集中度", hint: "10 分为格局收敛、龙头有定价权" },
  { key: "cycle_resilience_score", label: "周期韧性", hint: "10 分为弱周期、能穿越周期" },
  { key: "current_market_size_score", label: "当前市场规模", hint: "已兑现的可寻址规模" },
  { key: "future_market_size_score", label: "远期市场规模", hint: "3—5 年可兑现空间" }
] as const;

export type TrackScoreKey = (typeof TRACK_SCORE_DIMENSIONS)[number]["key"];

export const SCORE_MAX = 10;

export type ScoreCell = { key: TrackScoreKey; label: string; hint: string; value: number | null };

/** 六维分数取值，缺值给 null 由调用方显示占位，不补 0——0 分和没打分是两回事。 */
export function buildScoreCells(snapshot?: Partial<TrackTrendSnapshot> | null): ScoreCell[] {
  return TRACK_SCORE_DIMENSIONS.map((item) => {
    const value = snapshot?.[item.key];
    return { key: item.key, label: item.label, hint: item.hint, value: typeof value === "number" ? value : null };
  });
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
    trackGrade: snapshot.track_grade || null,
    heatTier: snapshot.heat_tier || null,
    overallScore: snapshot.overall_score ?? null,
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
  // 打了分就算有结论：长文本可以缺，六维评分不能缺，快照存在就一定有分数。
  if (typeof snapshot.overall_score === "number") return true;
  const cells = buildAnalysisCells(snapshot);
  if (cells.some((item) => item.value)) return true;
  if (snapshot.core_judgment || snapshot.key_contradiction) return true;
  return splitSegments(snapshot.segments_json).benefiting.length > 0;
}

/** 单系列用项目主色；评分走势加热度时才出现第二个系列，两色经 CVD 校验可区分。 */
const SCORE_ACCENT = "#2563eb";
const HEAT_ACCENT = "#f97316";

/**
 * 六维评分雷达。只画一份快照：多份叠在一张雷达上会糊成一团，历史对比交给下面的走势图。
 * 满分固定 10，不按当前最大值自适应——自适应会让 5 分看起来像顶格。
 */
export function buildScoreRadarOption(
  snapshot: Partial<TrackTrendSnapshot> | null | undefined,
  mode: "light" | "dark",
  palette: { text: string; grid: string }
): EChartsOption {
  const cells = buildScoreCells(snapshot);
  return {
    tooltip: { trigger: "item" },
    radar: {
      indicator: cells.map((item) => ({ name: item.label, max: SCORE_MAX })),
      radius: "66%",
      axisName: { color: palette.text, fontSize: 12 },
      splitLine: { lineStyle: { color: palette.grid } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: palette.grid } }
    },
    series: [
      {
        type: "radar",
        symbolSize: 8,
        lineStyle: { width: 2, color: SCORE_ACCENT },
        itemStyle: { color: SCORE_ACCENT },
        areaStyle: { color: SCORE_ACCENT, opacity: 0.16 },
        data: [
          {
            name: "六维评分",
            value: cells.map((item) => item.value),
            label: { show: true, color: palette.text, fontSize: 11, formatter: (params: { value: number }) => (params.value === null ? "" : String(params.value)) }
          }
        ]
      }
    ],
    darkMode: mode === "dark"
  };
}

type ScoreRow = Pick<TrackTrendSnapshot, "research_date" | "overall_score" | "market_heat_score">;

/**
 * 综合分与市场热度随时间的走势。两条线分开看才有意义：综合分抬升而热度不动，是还没被
 * 市场定价；热度冲高而综合分不动，是纯情绪。纵轴固定 0—10，同一天多份快照全部保留。
 */
export function buildScoreTimelineOption(
  rows: ScoreRow[],
  mode: "light" | "dark",
  palette: { text: string; grid: string }
): EChartsOption {
  const ordered = [...rows]
    .filter((item) => item.research_date)
    .sort((a, b) => String(a.research_date).localeCompare(String(b.research_date)));
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "line" } },
    legend: { textStyle: { color: palette.text } },
    grid: { left: 44, right: 18, top: 36, bottom: 30 },
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
      max: SCORE_MAX,
      interval: 2,
      axisLabel: { color: palette.text },
      splitLine: { lineStyle: { color: palette.grid } }
    },
    series: [
      {
        name: "综合分",
        type: "line",
        smooth: true,
        connectNulls: true,
        symbolSize: 8,
        lineStyle: { width: 2, color: SCORE_ACCENT },
        itemStyle: { color: SCORE_ACCENT },
        data: ordered.map((item) => item.overall_score ?? null)
      },
      {
        name: "市场热度",
        type: "line",
        smooth: true,
        connectNulls: true,
        symbolSize: 8,
        lineStyle: { width: 2, color: HEAT_ACCENT },
        itemStyle: { color: HEAT_ACCENT },
        data: ordered.map((item) => item.market_heat_score ?? null)
      }
    ],
    darkMode: mode === "dark"
  };
}
