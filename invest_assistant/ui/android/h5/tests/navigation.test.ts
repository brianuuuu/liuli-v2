import { describe, expect, it } from "vitest";
import { dashboardTabs, rootSections, sectionForPath } from "../src/app/navigation";

describe("mobile navigation", () => {
  it("keeps the five native sections in the approved order", () => {
    expect(rootSections.map((item) => item.label)).toEqual(["看板", "笔记", "新闻", "预警", "我的"]);
    expect(rootSections.map((item) => item.path)).toEqual([
      "/dashboard",
      "/notes",
      "/news",
      "/alerts",
      "/me"
    ]);
  });

  it("keeps the dashboard tabs in the approved order", () => {
    expect(dashboardTabs.map((item) => item.label)).toEqual(["今日", "市场", "赛道", "标的", "组合"]);
  });

  it("maps ordinary detail routes to their parent native section", () => {
    expect(sectionForPath("/news/42")).toBe("news");
    expect(sectionForPath("/alerts/8")).toBe("alerts");
    expect(sectionForPath("/reports/9")).toBe("dashboard");
  });
});
