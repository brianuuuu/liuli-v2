import { describe, expect, it } from "vitest";
import { parentPathForDetail, sectionForPath } from "../src/app/navigation";
import {
  DEFAULT_STOCK_DETAIL_SECTION,
  STOCK_DETAIL_SECTIONS,
  actionableMaterials,
  formatValuationGap,
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
    expect(STOCK_DETAIL_SECTIONS.map((item) => item.label)).toEqual(["概览", "评级", "估值", "趋势", "材料", "笔记"]);
    expect(STOCK_DETAIL_SECTIONS.map((item) => item.value)).toEqual([
      "overview",
      "rating",
      "valuation",
      "trend",
      "materials",
      "notes"
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
