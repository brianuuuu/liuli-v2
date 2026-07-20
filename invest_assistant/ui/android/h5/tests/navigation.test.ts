import { describe, expect, it } from "vitest";
import { dashboardTabs, parentPathForDetail, rootSections, sectionForPath } from "../src/app/navigation";

describe("mobile navigation", () => {
  it("keeps the five native sections in the approved order", () => {
    expect(rootSections.map((item) => item.label)).toEqual(["看板", "资讯", "笔记", "待办", "我的"]);
    expect(rootSections.map((item) => item.path)).toEqual([
      "/dashboard",
      "/news",
      "/notes",
      "/tasks",
      "/me"
    ]);
  });

  it("keeps the dashboard tabs in the approved order", () => {
    expect(dashboardTabs.map((item) => item.label)).toEqual(["今日", "市场", "赛道", "标的", "组合"]);
  });

  it("maps ordinary detail routes to their parent native section", () => {
    expect(sectionForPath("/news/42")).toBe("news");
    expect(sectionForPath("/tasks/alerts/8")).toBe("tasks");
    expect(sectionForPath("/notes/5")).toBe("notes");
    expect(sectionForPath("/reports/9")).toBe("dashboard");
  });

  it("provides deterministic parents for directly opened detail routes", () => {
    expect(parentPathForDetail("/news/42")).toBe("/news");
    expect(parentPathForDetail("/notes/5")).toBe("/notes");
    expect(parentPathForDetail("/tasks/alerts/8")).toBe("/tasks");
    expect(parentPathForDetail("/tasks/suggestions/11")).toBe("/tasks");
    expect(parentPathForDetail("/reports/9")).toBe("/reports");
    expect(parentPathForDetail("/dashboard")).toBeNull();
  });
});
