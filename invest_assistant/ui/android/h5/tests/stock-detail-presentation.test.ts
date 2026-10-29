import { describe, expect, it } from "vitest";
import { parentPathForDetail, sectionForPath } from "../src/app/navigation";
import {
  DEFAULT_STOCK_DETAIL_SECTION,
  STOCK_DETAIL_SECTIONS,
  actionableMaterials,
  assumptionResultTone,
  formatValuationGap,
  overviewChanges,
  overviewChangeTone,
  overviewTheses,
  overviewWatchlist,
  parseValuationAssumptions,
  researchFreshness,
  priorityRankLabel,
  scoreDimensions,
  scoreTrendRows,
  suggestedGroupLabel,
  trackNames,
  trendDimensions,
  trendHistoryRows,
  trendLevelTone,
  trendNarratives,
  valuationGapTone,
  valuationHistoryRows,
  valuationModelLabel
} from "../src/pages/stockDetailPresentation";
import type {
  StockDetail,
  StockDetailMaterial,
  StockScoreSnapshot,
  StockTrendSnapshot,
  StockValuationSnapshot
} from "../src/types/api";

const score = {
  id: 1,
  report_time: "2026-08-31",
  business_moat_score: 8.5,
  management_score: 7.5,
  governance_score: 8,
  strategy_score: 8,
  certainty_score: 8.2,
  growth_score: 6.5,
  total_score: 7.8
} as StockScoreSnapshot;

describe("标的详情路由", () => {
  it("详情页归属看板并回退到看板", () => {
    expect(sectionForPath("/stocks/42")).toBe("dashboard");
    expect(parentPathForDetail("/stocks/42")).toBe("/dashboard");
    expect(parentPathForDetail("/stocks")).toBeNull();
  });
});

describe("标的详情分区", () => {
  it("默认进入概览，评级、估值、趋势各自独立成页", () => {
    expect(DEFAULT_STOCK_DETAIL_SECTION).toBe("overview");
    expect(STOCK_DETAIL_SECTIONS.map((item) => item.label)).toEqual(["概览", "评级", "估值", "趋势", "笔记", "材料"]);
    expect(STOCK_DETAIL_SECTIONS.map((item) => item.value)).toEqual([
      "overview",
      "rating",
      "valuation",
      "trend",
      "notes",
      "materials"
    ]);
  });
});

const trend = {
  id: 9,
  research_date: "2026-09-11",
  market_data_date: "2026-09-10",
  trend_level: "T2",
  researcher_code: "trend_001",
  main_track: "消费电子",
  track_short: "中",
  track_mid: "中",
  track_long: "强",
  company_position: "核心受益",
  market_recognition: "品牌出海有辨识度，AI 家庭生态叙事发酵；尚未证明成为全市场主线核心",
  capital_recognition: "9月3日放量启动后缩量回踩，成交量约20日均量的七成",
  stock_stage: "修复",
  mainline_cycle: "发酵",
  suggested_group: "candidate",
  priority_rank: null,
  core_logic: "突破后回踩修复，等待量价确认。",
  primary_risk: "放量跌破平台上沿则修复逻辑弱化。"
} as StockTrendSnapshot;

describe("趋势展示口径", () => {
  it("T0 与 T1 视为强势，其余不着色", () => {
    expect(trendLevelTone("T0")).toBe("positive");
    expect(trendLevelTone("T1")).toBe("positive");
    expect(trendLevelTone("T2")).toBe("");
    expect(trendLevelTone("T5")).toBe("");
    expect(trendLevelTone(null)).toBe("");
  });

  it("分组建议与全池排名按中文呈现，未排名不显示为 0", () => {
    expect(suggestedGroupLabel("focused")).toBe("重点");
    expect(suggestedGroupLabel("candidate")).toBe("候选");
    expect(suggestedGroupLabel(null)).toBe("-");
    expect(priorityRankLabel(null)).toBe("未做全池排名");
    expect(priorityRankLabel(3)).toBe("全池第 3 位");
  });

  it("六维合并赛道三个期限，认可度整句不截断", () => {
    const rows = trendDimensions(trend);
    expect(rows.map((item) => item.label)).toEqual(["赛道趋势", "公司地位", "市场认可", "资金认可", "日线位置", "主线周期"]);
    expect(rows[0].value).toBe("中 / 中 / 强");
    expect(rows[2].value).toBe(trend.market_recognition);
    expect(trendDimensions({} as StockTrendSnapshot).map((item) => item.value)).toEqual(["-", "-", "-", "-", "-", "-"]);
  });

  it("长文本只列出有内容的字段，主要风险单独着色", () => {
    const rows = trendNarratives(trend);
    expect(rows.map((item) => item.label)).toEqual(["核心逻辑", "主要风险"]);
    expect(rows[1].risk).toBe(true);
    expect(trendNarratives({ ...trend, core_logic: "  ", primary_risk: null } as StockTrendSnapshot)).toEqual([]);
  });

  it("历史趋势与历史估值都按时间倒序，最新在最前", () => {
    const trends = trendHistoryRows([
      { ...trend, id: 1, research_date: "2026-07-05" },
      { ...trend, id: 2, research_date: "2026-09-11" }
    ]);
    expect(trends.map((item) => item.id)).toEqual([2, 1]);
    const valuations = valuationHistoryRows([
      { id: 1, analysis_date: "2026-04-25" },
      { id: 2, analysis_date: "2026-09-10" }
    ] as StockValuationSnapshot[]);
    expect(valuations.map((item) => item.id)).toEqual([2, 1]);
  });
});

describe("展示口径", () => {
  it("六维评分按固定顺序映射为雷达图数据", () => {
    expect(scoreDimensions(score)).toEqual([
      { name: "壁垒", value: 8.5 },
      { name: "管理", value: 7.5 },
      { name: "治理", value: 8 },
      { name: "战略", value: 8 },
      { name: "确定性", value: 8.2 },
      { name: "成长", value: 6.5 }
    ]);
  });

  it("估值空间沿用涨红跌绿，并给出模型中文名", () => {
    expect(formatValuationGap(0.1234)).toBe("+12.34%");
    expect(formatValuationGap(-0.05)).toBe("-5.00%");
    expect(formatValuationGap(null)).toBe("-");
    expect(valuationGapTone(0.1)).toBe("positive");
    expect(valuationGapTone(-0.1)).toBe("negative");
    expect(valuationGapTone(0)).toBe("");
    expect(valuationModelLabel("fcf")).toBe("FCF 模型");
    expect(valuationModelLabel(null)).toBe("-");
  });

  it("材料默认隐藏已忽略和噪音", () => {
    const rows = [
      { id: 1, status: "confirmed", impact_direction: "negative" },
      { id: 2, status: "ignored", impact_direction: "neutral" },
      { id: 3, status: "confirmed", impact_direction: "noise" },
      { id: 4, status: "pending", impact_direction: "neutral" }
    ] as StockDetailMaterial[];
    expect(actionableMaterials(rows).map((item) => item.id)).toEqual([1, 4]);
  });

  it("评分趋势按时间正序并只保留最近若干期", () => {
    const rows = ["2026-01-31", "2026-08-31", "2026-03-31"].map((report_time, index) => ({
      ...score,
      id: index + 1,
      report_time
    }));
    expect(scoreTrendRows(rows, 2).map((item) => item.report_time)).toEqual(["2026-03-31", "2026-08-31"]);
  });

  it("赛道名过滤空值", () => {
    const detail = { tracks: [{ id: 1, track: { name: "医疗器械" } }, { id: 2, track: null }] } as StockDetail;
    expect(trackNames(detail)).toEqual(["医疗器械"]);
  });
});

describe("估值假设解析", () => {
  it("解析出本次假设和上一期验证", () => {
    const parsed = parseValuationAssumptions(JSON.stringify({
      previous_period: "2025-Q4",
      last_assumptions_vs_actual: [{ metric: "收入同比增速", assumed: "25%", actual: "18%", result: "不如预期" }],
      current_assumptions: [{ metric: "收入同比增速", assumed: "18%" }]
    }));

    // previous_period 是被验证的那一期，不是本次的报告期
    expect(parsed?.previous_period).toBe("2025-Q4");
    expect(parsed?.current_assumptions?.[0]).toEqual({ metric: "收入同比增速", assumed: "18%" });
    expect(parsed?.last_assumptions_vs_actual?.[0].result).toBe("不如预期");
  });

  it("没填、坏结构、空内容一律当没填，卡片不渲染", () => {
    expect(parseValuationAssumptions(null)).toBeNull();
    expect(parseValuationAssumptions("")).toBeNull();
    expect(parseValuationAssumptions("不是 JSON")).toBeNull();
    expect(parseValuationAssumptions(JSON.stringify(["数组不是对象"]))).toBeNull();
    // 两个列表都空时没有可展示的内容，不给老标的留空卡
    expect(parseValuationAssumptions(JSON.stringify({ previous_period: "2025-Q4", last_assumptions_vs_actual: [], current_assumptions: [] }))).toBeNull();
  });

  it("丢掉没有 metric 的条目", () => {
    const parsed = parseValuationAssumptions(JSON.stringify({
      current_assumptions: [{ metric: "净利率", assumed: "12%" }, { assumed: "没有指标名" }]
    }));

    expect(parsed?.current_assumptions).toHaveLength(1);
  });

  it("判定配色沿用涨红跌绿，未知判定归中性", () => {
    expect(assumptionResultTone("超预期")).toBe("positive");
    expect(assumptionResultTone("不如预期")).toBe("negative");
    expect(assumptionResultTone("符合预期")).toBe("neutral");
    expect(assumptionResultTone("略好于预期")).toBe("neutral");
    expect(assumptionResultTone(null)).toBeNull();
  });
});

describe("概览（投资一页纸）", () => {
  const baseDetail = {
    stock: { id: 1 },
    score_history: [],
    valuation_history: [],
    trend_history: [],
    materials: [],
    disclosures: [],
    tracks: [],
    notes: []
  } as unknown as StockDetail;

  it("投资要点合并两份研究：基本面、交易逻辑各一段，相同的风险只留一份", () => {
    const detail = {
      ...baseDetail,
      latest_score: { ...score, core_logic: "订单放量", primary_risk: "客户集中" },
      latest_trend: { ...trend, core_logic: "主线发酵", primary_risk: "客户集中" }
    } as StockDetail;
    expect(overviewTheses(detail)).toEqual([
      { label: "基本面逻辑", values: ["订单放量"], risk: false, section: "rating" },
      { label: "交易逻辑", values: ["主线发酵"], risk: false, section: "trend" },
      { label: "主要风险", values: ["客户集中"], risk: true, section: "rating" }
    ]);
    expect(overviewTheses(baseDetail)).toEqual([]);
  });

  it("跟踪清单汇总验证点、估值假设和上期兑现，空项不占位", () => {
    const detail = {
      ...baseDetail,
      latest_trend: { ...trend, next_verification: "三季报毛利率", data_gaps: "" },
      latest_valuation: {
        id: 3,
        valuation_assumptions_json: JSON.stringify({
          current_assumptions: [{ metric: "营收增速", assumed: "25%" }, { metric: "毛利率", assumed: "40%" }],
          last_assumptions_vs_actual: [
            { metric: "营收", result: "超预期" },
            { metric: "利润", result: "超预期" },
            { metric: "毛利率", result: "不如预期" }
          ]
        })
      }
    } as StockDetail;
    expect(overviewWatchlist(detail)).toEqual([
      { label: "下一验证点", value: "三季报毛利率", section: "trend" },
      { label: "估值假设", value: "营收增速 25% · 毛利率 40%", section: "valuation" },
      { label: "上期兑现", value: "2 项超预期 · 1 项不如预期", section: "valuation" }
    ]);
  });

  it("最近变化和上一期比：评级看总分，趋势 T 级变小算变好，估值比合理市值", () => {
    const detail = {
      ...baseDetail,
      score_history: [
        { ...score, id: 1, report_time: "2026-05-01", total_score: 7.2, investment_level: "B" },
        { ...score, id: 2, report_time: "2026-08-31", total_score: 7.8, investment_level: "A" }
      ],
      trend_history: [
        { ...trend, id: 1, research_date: "2026-09-11", trend_level: "T2" },
        { ...trend, id: 2, research_date: "2026-08-01", trend_level: "T3" }
      ],
      valuation_history: [
        { id: 1, analysis_date: "2026-06-01", expected_market_value_3y: 1500 },
        { id: 2, analysis_date: "2026-09-01", expected_market_value_3y: 1200 }
      ]
    } as unknown as StockDetail;
    expect(overviewChanges(detail)).toEqual([
      { label: "评级", from: "B 7.2", to: "A 7.8", direction: "up", date: "2026-08-31", section: "rating" },
      { label: "趋势", from: "T3", to: "T2", direction: "up", date: "2026-09-11", section: "trend" },
      { label: "合理市值", from: "1,500", to: "1,200", direction: "down", date: "2026-09-01", section: "valuation" }
    ]);
    expect(overviewChangeTone("up")).toBe("positive");
    expect(overviewChangeTone("down")).toBe("negative");
    expect(overviewChangeTone("first")).toBe("");
  });

  it("只有一期时标为首次，历史缺字段不报错", () => {
    const detail = { ...baseDetail, score_history: [score], trend_history: undefined, valuation_history: undefined } as unknown as StockDetail;
    expect(overviewChanges(detail)).toEqual([
      { label: "评级", from: null, to: "- 7.8", direction: "first", date: "2026-08-31", section: "rating" }
    ]);
  });

  it("研究时效超过 90 天标为过期", () => {
    const detail = {
      ...baseDetail,
      latest_score: { ...score, report_time: "2026-05-01" },
      latest_trend: { ...trend, research_date: "2026-09-11" }
    } as StockDetail;
    expect(researchFreshness(detail, new Date("2026-09-20T12:00:00"))).toEqual([
      { label: "评级", date: "2026-05-01", stale: true },
      { label: "趋势", date: "2026-09-11", stale: false }
    ]);
  });
});
