import { describe, expect, it } from "vitest";
import {
  DEFAULT_POOL_STATUS,
  DEFAULT_STOCK_TAB_VIEW,
  POOL_STATUS_OPTIONS,
  STOCK_TAB_VIEWS,
  filterPoolByStatus,
  poolStatusCounts,
  poolStatusLabel,
  poolStatusTone,
  poolTrackSummary
} from "../src/pages/stockPoolGroups";
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
    expect(STOCK_TAB_VIEWS.map((item) => item.label)).toEqual(["最新材料", "标的池"]);
  });
});

describe("标的池状态分组", () => {
  it("状态口径与 Web 标的池一致", () => {
    expect(DEFAULT_POOL_STATUS).toBe("all");
    expect(POOL_STATUS_OPTIONS.map((item) => item.label)).toEqual(["全部", "重点跟踪", "观察", "候选", "归档"]);
    expect(poolStatusLabel("focused")).toBe("重点跟踪");
    expect(poolStatusLabel(null)).toBe("未知");
    expect(poolStatusTone("focused")).toBe("focused");
    expect(poolStatusTone("unknown")).toBe("candidate");
  });

  it("按状态过滤并在端上统计分组数量", () => {
    expect(filterPoolByStatus(items).map((item) => item.id)).toEqual([1, 2, 3, 4, 5]);
    expect(filterPoolByStatus(items, "candidate").map((item) => item.id)).toEqual([3, 4]);
    expect(poolStatusCounts(items)).toEqual({ all: 5, focused: 1, watching: 1, candidate: 2, archived: 1 });
  });
});

describe("绑定赛道摘要", () => {
  it("最多展示两条赛道，其余折叠", () => {
    expect(poolTrackSummary(items[0])).toBe("智能汽车 · 机器人");
    expect(poolTrackSummary(items[4])).toBe("AI应用 · 云计算 +1");
  });

  it("没有绑定赛道时给出占位文案", () => {
    expect(poolTrackSummary(items[1])).toBe("未绑定赛道");
    expect(poolTrackSummary(items[2])).toBe("未绑定赛道");
  });
});
