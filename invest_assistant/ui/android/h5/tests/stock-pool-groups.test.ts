import { describe, expect, it } from "vitest";
import {
  DEFAULT_POOL_STATUS,
  DEFAULT_STOCK_TAB_VIEW,
  POOL_STATUS_OPTIONS,
  STOCK_TAB_VIEWS,
  filterPoolByStatus,
  poolStatusCounts,
  poolStatusLabel,
  poolTrackSummary
} from "../src/pages/stockPoolGroups";
import {
  lastDashboardTab,
  lastPoolStatus,
  lastStockView,
  rememberDashboardTab,
  rememberPoolStatus,
  rememberStockView,
  resetDashboardViewState
} from "../src/pages/dashboardViewState";
import type { StockPoolItem } from "../src/types/api";

const items = [
  { id: 1, stock_id: 11, stock_name: "星宇股份", status: "archived", tracks: [{ id: 1, name: "智能汽车" }, { id: 2, name: "机器人" }] },
  { id: 2, stock_id: 12, stock_name: "奇安信", status: "focused", tracks: [] },
  { id: 3, stock_id: 13, stock_name: "美的集团", status: "candidate" },
  { id: 4, stock_id: 14, stock_name: "中国海油", status: "candidate", tracks: [{ id: 3, name: "能源" }] },
  { id: 5, stock_id: 15, stock_name: "金山办公", status: "watching", tracks: [{ id: 4, name: "AI应用" }, { id: 5, name: "云计算" }, { id: 6, name: "SaaS" }] }
] as StockPoolItem[];

describe("标的 tab 视图切换", () => {
  it("默认展示最新材料，标的池是第二个可选项", () => {
    expect(DEFAULT_STOCK_TAB_VIEW).toBe("materials");
    expect(STOCK_TAB_VIEWS.map((item) => item.label)).toEqual(["重要材料", "标的池"]);
  });
});

describe("标的池状态分组", () => {
  it("状态口径与 Web 标的池一致", () => {
    expect(DEFAULT_POOL_STATUS).toBe("focused");
    expect(POOL_STATUS_OPTIONS.map((item) => item.label)).toEqual(["全部", "重点跟踪", "观察", "候选", "归档"]);
    expect(poolStatusLabel("focused")).toBe("重点跟踪");
    expect(poolStatusLabel(null)).toBe("未知");
  });

  it("按状态过滤并在端上统计分组数量", () => {
    expect(filterPoolByStatus(items).map((item) => item.id)).toEqual([1, 2, 3, 4, 5]);
    expect(filterPoolByStatus(items, "candidate").map((item) => item.id)).toEqual([3, 4]);
    expect(poolStatusCounts(items)).toEqual({ all: 5, focused: 1, watching: 1, candidate: 2, archived: 1 });
  });
});

describe("绑定赛道摘要", () => {
  it("只展示一条赛道，其余折叠", () => {
    expect(poolTrackSummary(items[0])).toBe("智能汽车 +1");
    expect(poolTrackSummary(items[4])).toBe("AI应用 +2");
  });

  it("没有绑定赛道时返回空串，由调用方不渲染", () => {
    expect(poolTrackSummary(items[1])).toBe("");
    expect(poolTrackSummary(items[2])).toBe("");
  });
});

describe("看板视图记忆", () => {
  it("记住看板 tab、标的视图和标的池分组，从详情返回时不回到今日", () => {
    resetDashboardViewState();
    expect(lastDashboardTab()).toBe("today");
    expect(lastStockView()).toBe("materials");
    expect(lastPoolStatus()).toBe("focused");

    rememberDashboardTab("stock");
    rememberStockView("pool");
    rememberPoolStatus("watching");
    expect(lastDashboardTab()).toBe("stock");
    expect(lastStockView()).toBe("pool");
    expect(lastPoolStatus()).toBe("watching");
    resetDashboardViewState();
  });
});
