import { describe, expect, it } from "vitest";
import { parentPathForDetail, sectionForPath } from "../src/app/navigation";
import {
  DEFAULT_STOCK_DETAIL_SECTION,
  STOCK_DETAIL_SECTIONS,
  actionableMaterials,
  formatValuationGap,
  scoreDimensions,
  scoreTrendRows,
  trackNames,
  valuationGapTone,
  valuationModelLabel
} from "../src/pages/stockDetailPresentation";
import type { StockDetail, StockDetailMaterial, StockScoreSnapshot } from "../src/types/api";

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
  it("默认进入概览，四个分区顺序固定", () => {
    expect(DEFAULT_STOCK_DETAIL_SECTION).toBe("overview");
    expect(STOCK_DETAIL_SECTIONS.map((item) => item.label)).toEqual(["概览", "评分估值", "材料", "笔记"]);
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
