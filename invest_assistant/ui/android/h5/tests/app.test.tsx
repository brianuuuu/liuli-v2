import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HashRouter } from "react-router-dom";
import { MobileApp } from "../src/app/MobileApp";
import { tokenStorageKey } from "../src/api/client";

vi.mock("../src/components/MiniChart", () => ({
  DonutChart: ({ items }: { items: Array<{ name: string; value: number }> }) => (
    <div aria-label="标的组合图">{items.map((item) => item.name).join("、")}</div>
  )
}));

vi.mock("../src/components/PortfolioTreemap", () => ({
  PortfolioTreemap: ({ items }: { items: Array<{ name: string; currentPrice?: number | null; dayPct?: number | null }> }) => (
    <div aria-label="标的热力图">{items.map((item) => `${item.name}:${item.currentPrice ?? "--"}:${item.dayPct ?? "--"}`).join("、")}</div>
  )
}));

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <MobileApp />
      </QueryClientProvider>
    </HashRouter>
  );
}

class DashboardObserverFake {
  static instances: DashboardObserverFake[] = [];
  readonly callback: IntersectionObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    DashboardObserverFake.instances.push(this);
  }

  intersect() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

describe("mobile H5 app", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = "";
    DashboardObserverFake.instances = [];
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.LiuliNative;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the H5 login and hides the native bottom bar before authentication", async () => {
    const setNavigationState = vi.fn();
    window.LiuliNative = { setNavigationState };

    renderApp();

    expect(await screen.findByRole("heading", { name: "琉璃" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(setNavigationState).toHaveBeenCalledWith("dashboard", false, false);
  });

  it("renders the news root with the shared compact secondary navigation", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/news";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, limit: 30, offset: 0, has_more: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    renderApp();

    expect(await screen.findByRole("tab", { name: "个股" })).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toHaveAttribute("data-height", "36");
  });

  it("hides the native bottom bar only while reading a report", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/reports/7";
    const setNavigationState = vi.fn();
    window.LiuliNative = { setNavigationState };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 7, title: "测试报告", report_type: "research", source_module: "stock" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    renderApp();

    await waitFor(() => expect(setNavigationState).toHaveBeenCalledWith("dashboard", false, true));
  });

  it("shows the authenticated username instead of a stale display name", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/me";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 1, username: "admin", display_name: "brian" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    renderApp();

    expect(await screen.findByText("admin", {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.queryByText("brian")).not.toBeInTheDocument();
  });

  it("loads a dashboard index only after it becomes the pager target", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/console/workbench-today")) {
        return new Response(JSON.stringify({
          market_indices: {
            items: [
              { code: "000001.SH", name: "上证指数", price: 3200.12, change: 12.3, pct_chg: 0.39, status: "success" },
              { code: "399001.SZ", name: "深证成指", price: 10200.45, change: -20.1, pct_chg: -0.2, status: "success" }
            ]
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/market-radar/overview")) {
        return new Response(JSON.stringify({ source_items: 0, active_tags: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/market-radar/rankings")) {
        return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ items: [], total: 0, limit: 30, offset: 0, has_more: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    expect(await screen.findByText("上证指数", {}, { timeout: 3_000 })).toBeInTheDocument();
    expect(screen.getByText("深证成指")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/rankings"))).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "市场" }));
    await waitFor(() => {
      const rankingUrl = fetchMock.mock.calls.map(([input]) => String(input)).find((url) => url.includes("/rankings"));
      expect(rankingUrl).toContain("type=all");
    });
  });

  it("places market heat filters below the ranking and reloads for both selections", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/console/workbench-today")) {
        return new Response(JSON.stringify({ market_indices: { items: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("/api/market-radar/rankings")) {
        const name = url.includes("type=track") && url.includes("window=30d")
          ? "三十日赛道"
          : url.includes("type=stock") ? "标的热度" : "市场热词";
        return new Response(JSON.stringify([{
          tag_id: name === "三十日赛道" ? 2 : 1,
          trigger_count: 8,
          source_count: 3,
          heat_score: 12.5,
          rank_no: 1,
          tag: { id: name === "三十日赛道" ? 2 : 1, name }
        }]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ items: [], total: 0, limit: 4, offset: 0, has_more: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    const marketTab = await screen.findByRole("tab", { name: "市场" });
    fireEvent.click(marketTab);
    await waitFor(() => expect(marketTab).toHaveAttribute("aria-selected", "true"));

    const heading = await screen.findByRole("heading", { name: "热度排行榜" });
    const ranking = await screen.findByText("1. 市场热词");
    const typeFilter = screen.getByRole("group", { name: "排行榜类型" });
    const windowFilter = screen.getByRole("group", { name: "时间范围" });

    expect(heading.compareDocumentPosition(ranking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ranking.compareDocumentPosition(typeFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(typeFilter.compareDocumentPosition(windowFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(typeFilter.parentElement).toHaveAttribute("data-swipe-ignore", "true");
    expect(screen.queryByText("信息总量")).not.toBeInTheDocument();
    expect(screen.queryByText("活跃标签")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/market-radar/overview"))).toBe(false);
    const initialRankingUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes("/api/market-radar/rankings"));
    expect(initialRankingUrl).toContain("type=all");
    expect(initialRankingUrl).toContain("window=7d");
    expect(screen.getByRole("button", { name: "标的" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "标签" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "标的" }));
    expect(await screen.findByText("1. 标的热度")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => {
      const url = String(input);
      return url.includes("/api/market-radar/rankings") && url.includes("type=stock") && url.includes("window=7d");
    })).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "赛道" }));
    fireEvent.click(screen.getByRole("button", { name: "30d" }));

    expect(await screen.findByText("1. 三十日赛道")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "赛道" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30d" })).toHaveAttribute("aria-pressed", "true");
    expect(fetchMock.mock.calls.some(([input]) => {
      const url = String(input);
      return url.includes("/api/market-radar/rankings") && url.includes("type=track") && url.includes("window=30d");
    })).toBe(true);
  });

  it("keeps the market heat filters available below the loading state", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    let resolveRankings!: (response: Response) => void;
    const pendingRankings = new Promise<Response>((resolve) => { resolveRankings = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/market-radar/rankings")) return pendingRankings;
      if (url.includes("/api/console/workbench-today")) {
        return new Response(JSON.stringify({ market_indices: { items: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ items: [], total: 0, limit: 4, offset: 0, has_more: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }));

    renderApp();
    const marketTab = await screen.findByRole("tab", { name: "市场" });
    fireEvent.click(marketTab);
    await waitFor(() => expect(marketTab).toHaveAttribute("aria-selected", "true"));

    const loading = await screen.findByLabelText("加载中");
    const typeFilter = screen.getByRole("group", { name: "排行榜类型" });
    expect(loading.compareDocumentPosition(typeFilter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    resolveRankings(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await screen.findByText("暂无热度排行")).toBeInTheDocument();
  });

  it("refreshes only the today dashboard queries after a top pull", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/console/workbench-today")) {
        return new Response(JSON.stringify({ market_indices: { items: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("/api/reports")) {
        return new Response(JSON.stringify({ items: [], total: 0, limit: 4, offset: 0, has_more: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await screen.findByText("投研工作台");
    const pullRegion = screen.getByLabelText("今日看板下拉刷新");
    fireEvent.touchStart(pullRegion, {
      touches: [{ identifier: 1, clientX: 120, clientY: 100, target: pullRegion }]
    });
    fireEvent.touchMove(pullRegion, {
      touches: [{ identifier: 1, clientX: 120, clientY: 230, target: pullRegion }]
    });
    fireEvent.touchEnd(pullRegion, {
      changedTouches: [{ identifier: 1, clientX: 120, clientY: 230, target: pullRegion }]
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/console/workbench-today"))).toHaveLength(2);
      expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/reports?offset=0&limit=4"))).toHaveLength(2);
    });
    expect(fetchMock.mock.calls.some(([input]) => (
      /\/api\/(?:market-radar\/rankings|track-discovery\/materials|stock-analysis\/materials|portfolios\/overview)/.test(String(input))
    ))).toBe(false);
  });

  it("shows the track material feed and appends the next page", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    vi.stubGlobal("IntersectionObserver", DashboardObserverFake);
    const firstItems = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      track_id: 8,
      track_name: index === 0 ? "半导体" : `赛道 ${index + 1}`,
      direction: index === 0 ? "support" : "noise",
      material_title: index === 0 ? "先进制程取得进展" : `材料 ${index + 1}`,
      material_summary: index === 0 ? "产业链验证进度加快" : null,
      material_source_name: "来源 A",
      material_time: "2026-07-29T10:00:00+08:00"
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/track-discovery/materials")) {
        const secondPage = url.includes("offset=10");
        return new Response(JSON.stringify({
          items: secondPage ? [{
            id: 11,
            track_id: 9,
            track_name: "机器人",
            direction: "neutral",
            material_title: "第二页材料",
            material_source_name: "来源 B"
          }] : firstItems,
          total: 11,
          limit: 10,
          offset: secondPage ? 10 : 0,
          has_more: !secondPage
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/console/workbench-today")) {
        return new Response(JSON.stringify({ market_indices: { items: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ items: [], total: 0, limit: 4, offset: 0, has_more: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    const trackTab = await screen.findByRole("tab", { name: "赛道" });
    fireEvent.click(trackTab);
    expect(await screen.findByText("先进制程取得进展")).toBeInTheDocument();
    expect(screen.getByText("半导体")).toBeInTheDocument();
    expect(screen.getByText("产业链验证进度加快")).toBeInTheDocument();
    expect(screen.getByText("利好")).toBeInTheDocument();
    expect(screen.queryByText("升温赛道")).not.toBeInTheDocument();
    expect(screen.queryByText("重点赛道")).not.toBeInTheDocument();
    expect(screen.queryByText("赛道热度")).not.toBeInTheDocument();

    DashboardObserverFake.instances.at(-1)?.intersect();
    expect(await screen.findByText("第二页材料")).toBeInTheDocument();
    expect(screen.getByText("先进制程取得进展")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => (
      String(input).includes("/api/track-discovery/materials?offset=10&limit=10")
    ))).toBe(true);
  });

  it("shows the stock material feed and appends the next page", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    vi.stubGlobal("IntersectionObserver", DashboardObserverFake);
    const firstItems = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      stock_id: 18,
      stock_name: index === 0 ? "宁德时代" : `标的 ${index + 1}`,
      stock_code: index === 0 ? "300750" : `${300750 + index}`,
      impact_direction: index === 0 ? "weaken" : "noise",
      material_title: index === 0 ? "海外订单增速放缓" : `标的材料 ${index + 1}`,
      material_summary: index === 0 ? "短期需求承压" : null,
      material_source_name: "来源 C",
      material_time: "2026-07-29T11:00:00+08:00"
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/stock-analysis/materials")) {
        const secondPage = url.includes("offset=10");
        return new Response(JSON.stringify({
          items: secondPage ? [{
            id: 11,
            stock_id: 19,
            stock_name: "贵州茅台",
            stock_code: "600519",
            impact_direction: "support",
            material_title: "第二页标的材料",
            material_source_name: "来源 D"
          }] : firstItems,
          total: 11,
          limit: 10,
          offset: secondPage ? 10 : 0,
          has_more: !secondPage
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/console/workbench-today")) {
        return new Response(JSON.stringify({ market_indices: { items: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ items: [], total: 0, limit: 4, offset: 0, has_more: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    const stockTab = await screen.findByRole("tab", { name: "标的" });
    fireEvent.click(stockTab);
    expect(await screen.findByText("海外订单增速放缓")).toBeInTheDocument();
    expect(screen.getByText("宁德时代")).toBeInTheDocument();
    expect(screen.getByText("300750")).toBeInTheDocument();
    expect(screen.getByText("短期需求承压")).toBeInTheDocument();
    expect(screen.getByText("利空")).toBeInTheDocument();
    expect(screen.queryByText("标的池")).not.toBeInTheDocument();
    expect(screen.queryByText("重点标的")).not.toBeInTheDocument();
    expect(screen.queryByText("评分排行")).not.toBeInTheDocument();

    DashboardObserverFake.instances.at(-1)?.intersect();
    expect(await screen.findByText("第二页标的材料")).toBeInTheDocument();
    expect(screen.getByText("海外订单增速放缓")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => (
      String(input).includes("/api/stock-analysis/materials?offset=10&limit=10")
    ))).toBe(true);
  });

  it("keeps edit groups as the pinned note navigation action", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/notes";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => new Response(
        String(input).includes("note-groups")
          ? "[]"
          : JSON.stringify({ items: [], total: 0, limit: 30, offset: 0, has_more: false }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ))
    );

    renderApp();

    const editGroups = await screen.findByRole("button", { name: "编辑分组" });
    expect(editGroups).toHaveClass("secondary-navigation__end-action");
    expect(screen.queryByText("编辑分组", { selector: ".note-toolbar *" })).not.toBeInTheDocument();
  });

  it("orders note metadata as date, group, body, and tags", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/notes";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes("note-groups")
        ? [{ id: 3, name: "投资复盘", sort_order: 0, status: "active" }]
        : url.includes("market-radar/tags")
          ? []
          : {
              items: [
                {
                  id: 9,
                  content: "关注产业链变化",
                  status: "active",
                  updated_at: "2026-07-25T09:30:00",
                  group: { id: 3, name: "投资复盘", sort_order: 0, status: "active" },
                  tags: [{ id: 5, name: "半导体" }]
                },
                {
                  id: 10,
                  content: "无分组随手记",
                  status: "active",
                  updated_at: "2026-07-25T10:00:00",
                  group: null,
                  tags: []
                }
              ],
              total: 2,
              limit: 30,
              offset: 0,
              has_more: false
            };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    renderApp();

    const group = await screen.findByText("投资复盘", { selector: ".note-card-group" });
    const body = screen.getByText("关注产业链变化");
    const tag = screen.getByText("#半导体");
    const card = group.closest(".note-card");
    const date = card?.querySelector("time");
    expect(date).not.toBeNull();
    if (!date) throw new Error("Expected note date metadata");
    expect(date.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.closest("header")).toBe(card?.querySelector("header"));
    expect(tag.closest("footer")).toBe(card?.querySelector("footer"));

    const ungroupedBody = screen.getByText("无分组随手记");
    const ungroupedCard = ungroupedBody.closest(".note-card");
    expect(ungroupedCard?.querySelector(".note-card-group")).toBeNull();
    expect(ungroupedCard?.querySelector("footer")).toBeNull();
  });

  it("searches existing tags and submits persistent tag relations for a note", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/notes/9";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("note-groups")) return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("market-radar/tags")) return new Response(JSON.stringify([
        { id: 5, name: "半导体", status: "active" },
        { id: 8, name: "AI 算力", status: "active" },
        { id: 13, name: "已停用", status: "disabled" }
      ]), { status: 200, headers: { "Content-Type": "application/json" } });
      const note = { id: 9, content: "关注产业链变化", status: "active", tags_text: "半导体", tags: [{ id: 5, name: "半导体" }] };
      return new Response(JSON.stringify(note), { status: init?.method === "PUT" ? 200 : 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    expect(await screen.findByRole("button", { name: /#半导体/ })).toBeInTheDocument();
    const tagsInput = screen.getByPlaceholderText("搜索并选择关联标签");
    fireEvent.change(tagsInput, { target: { value: "算力" } });
    expect(await screen.findByRole("option", { name: "#AI 算力" })).toBeInTheDocument();
    expect(screen.queryByText("#已停用")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "#AI 算力" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(putCall).toBeDefined();
      expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({ tags: null, tag_ids: [5, 8] });
    });
  });

  it("continues alert pagination when the selected status is absent from the first page", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/tasks";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("offset=0")) {
        return new Response(JSON.stringify({
          items: [{ id: 1, status: "read", event_level: "info", title: "已读事件", message: "第一页", event_time: "2026-07-20T00:00:00" }],
          total: 51,
          limit: 50,
          offset: 0,
          has_more: true
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        items: [{ id: 2, status: "handled", event_level: "info", title: "已处理事件", message: "第二页", event_time: "2026-07-19T00:00:00" }],
        total: 51,
        limit: 50,
        offset: 50,
        has_more: false
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    fireEvent.click(await screen.findByRole("tab", { name: "预警事件" }));
    fireEvent.click(await screen.findByRole("button", { name: "已处理" }));

    expect(await screen.findByText("已处理事件")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("offset=50"))).toBe(true);
  });

  it("opens tasks on AI recommendations before alert events", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/tasks";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0, has_more: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    renderApp();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["AI 推荐词", "预警事件"]);
    expect(screen.getByRole("tab", { name: "AI 推荐词" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByPlaceholderText("搜索推荐词")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增 AI 推荐词" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已通过" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已拒绝" })).not.toBeInTheDocument();
  });

  it("opens a compact review detail page when a recommendation card is clicked", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/tasks";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
        String(input).includes("/hotwords")
          ? { items: [], total: 0, limit: 100, offset: 0, has_more: false }
          : {
            items: [{
              id: 11,
              suggested_text: "半导体设备",
              score: 8.5,
              reason: "订单增长与国产替代共振",
              status: "pending",
              rejected_count: 3,
              created_at: "2026-07-20T08:00:00Z"
            }],
            total: 1,
            limit: 20,
            offset: 0,
            has_more: false
          }
      ), { status: 200, headers: { "Content-Type": "application/json" } }))
    );

    renderApp();
    const card = (await screen.findByText("半导体设备")).closest("button");
    expect(card).not.toBeNull();
    fireEvent.click(card!);

    expect(await screen.findByRole("heading", { name: "审核推荐词" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/tasks/suggestions/11");
    expect(screen.getByText("订单增长与国产替代共振")).toBeInTheDocument();
    expect(screen.getByLabelText("最终标签词")).toHaveValue("半导体设备");
    expect(screen.queryByText(/评分/)).not.toBeInTheDocument();
    expect(screen.queryByText(/历史拒绝/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("长按卡片 1 秒进行审核")).not.toBeInTheDocument();
  });

  it("restores a directly opened recommendation detail from session storage", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.sessionStorage.setItem("liuli.mobile.ai-suggestion.31", JSON.stringify({
      id: 31,
      suggested_text: "先进封装",
      reason: "封装技术持续演进",
      status: "pending",
      rejected_count: 0
    }));
    window.location.hash = "#/tasks/suggestions/31";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0, limit: 100, offset: 0, has_more: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    renderApp();

    expect(await screen.findByRole("heading", { name: "审核推荐词" })).toBeInTheDocument();
    expect(screen.getByText("先进封装")).toBeInTheDocument();
    expect(screen.getByText("封装技术持续演进")).toBeInTheDocument();
  });

  it("shows a deterministic fallback when recommendation detail data is unavailable", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/tasks/suggestions/99";
    vi.stubGlobal("fetch", vi.fn());

    renderApp();

    expect(await screen.findByText("推荐词数据已失效")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回待办列表" }));
    expect(window.location.hash).toBe("#/tasks");
  });

  it("approves a recommendation from the detail page and returns to tasks", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.sessionStorage.setItem("liuli.mobile.ai-suggestion.33", JSON.stringify({
      id: 33,
      suggested_text: "机器人关节",
      reason: "产业链需求增加",
      status: "pending",
      rejected_count: 0
    }));
    window.location.hash = "#/tasks/suggestions/33";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(
      init?.method === "POST"
        ? { id: 33, suggested_text: "机器人关节", status: "approved", rejected_count: 0 }
        : { items: [], total: 0, limit: 100, offset: 0, has_more: false }
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    fireEvent.change(await screen.findByLabelText("最终标签词"), { target: { value: "机器人核心零部件" } });
    fireEvent.click(screen.getByRole("button", { name: "通过" }));

    await waitFor(() => expect(window.location.hash).toBe("#/tasks"));
    const approveCall = fetchMock.mock.calls.find(([input, init]) =>
      init?.method === "POST" && String(input).includes("/ai-tag-suggestions/33/approve")
    );
    expect(approveCall).toBeDefined();
    expect(JSON.parse(String(approveCall?.[1]?.body))).toMatchObject({
      final_tag_name: "机器人核心零部件",
      target_type: "hotword"
    });
  });

  it("rejects one recommendation without confirmation and returns to tasks", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.sessionStorage.setItem("liuli.mobile.ai-suggestion.32", JSON.stringify({
      id: 32,
      suggested_text: "液冷服务器",
      reason: "数据中心散热需求提升",
      status: "pending",
      rejected_count: 0
    }));
    window.location.hash = "#/tasks/suggestions/32";
    const confirmSpy = vi.spyOn(window, "confirm");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(
      init?.method === "POST"
        ? { id: 32, suggested_text: "液冷服务器", status: "rejected", rejected_count: 1 }
        : { items: [], total: 0, limit: 100, offset: 0, has_more: false }
    ), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "拒绝" }));

    await waitFor(() => expect(window.location.hash).toBe("#/tasks"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([input, init]) =>
      init?.method === "POST" && String(input).includes("/ai-tag-suggestions/32/reject")
    )).toBe(true);
  });

  it("rejects every currently loaded recommendation one by one and reports the success count", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/tasks";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/reject")) {
        return new Response(JSON.stringify({ id: Number(url.match(/suggestions\/(\d+)/)?.[1]), status: "rejected" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        items: [
          { id: 21, suggested_text: "推荐词一", score: 7, reason: "原因一", status: "pending", rejected_count: 0 },
          { id: 22, suggested_text: "推荐词二", score: 6, reason: "原因二", status: "pending", rejected_count: 1 }
        ],
        total: 4,
        limit: 20,
        offset: 0,
        has_more: true
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm");

    renderApp();
    await screen.findByText("推荐词二");
    fireEvent.click(screen.getByRole("button", { name: "一键拒绝已加载推荐词" }));

    expect(await screen.findByText("已拒绝 2 条推荐词")).toBeInTheDocument();
    const rejectCalls = fetchMock.mock.calls.filter(([input, init]) =>
      init?.method === "POST" && String(input).includes("/reject")
    );
    expect(rejectCalls.map(([input]) => String(input))).toEqual([
      expect.stringContaining("/ai-tag-suggestions/21/reject"),
      expect.stringContaining("/ai-tag-suggestions/22/reject")
    ]);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("continues bulk rejection after a failure and reports both counts", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/tasks";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/41/reject")) {
        return new Response("failed", { status: 500 });
      }
      if (init?.method === "POST" && url.includes("/reject")) {
        return new Response(JSON.stringify({ id: 42, status: "rejected" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        items: [
          { id: 41, suggested_text: "失败项", reason: "原因一", status: "pending", rejected_count: 0 },
          { id: 42, suggested_text: "成功项", reason: "原因二", status: "pending", rejected_count: 0 }
        ],
        total: 2,
        limit: 20,
        offset: 0,
        has_more: false
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await screen.findByText("成功项");
    fireEvent.click(screen.getByRole("button", { name: "一键拒绝已加载推荐词" }));

    expect(await screen.findByText("已拒绝 1 条，1 条失败")).toBeInTheDocument();
    expect(screen.getByText("失败项")).toBeInTheDocument();
    expect(screen.queryByText("成功项")).not.toBeInTheDocument();
  });

  it("keeps all loaded rows when every bulk rejection request fails", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/tasks";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response("failed", { status: 500 });
      return new Response(JSON.stringify({
        items: [
          { id: 61, suggested_text: "保留一", reason: "原因一", status: "pending", rejected_count: 0 },
          { id: 62, suggested_text: "保留二", reason: "原因二", status: "pending", rejected_count: 0 }
        ],
        total: 2,
        limit: 20,
        offset: 0,
        has_more: false
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await screen.findByText("保留二");
    fireEvent.click(screen.getByRole("button", { name: "一键拒绝已加载推荐词" }));

    expect(await screen.findByText("已拒绝 0 条，2 条失败")).toBeInTheDocument();
    expect(screen.getByText("保留一")).toBeInTheDocument();
    expect(screen.getByText("保留二")).toBeInTheDocument();
  });

  it("prevents duplicate bulk rejection while requests are running", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/tasks";
    let resolveReject!: () => void;
    const pendingReject = new Promise<void>((resolve) => { resolveReject = resolve; });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        await pendingReject;
        return new Response(JSON.stringify({ id: 51, status: "rejected" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        items: [{ id: 51, suggested_text: "唯一推荐词", reason: "原因", status: "pending", rejected_count: 0 }],
        total: 1,
        limit: 20,
        offset: 0,
        has_more: false
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    await screen.findByText("唯一推荐词");
    const button = screen.getByRole("button", { name: "一键拒绝已加载推荐词" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    resolveReject();
    expect(await screen.findByText("已拒绝 1 条推荐词")).toBeInTheDocument();
  });

  it("shows the web-aligned portfolio performance on the today dashboard", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/console/workbench-today")) {
          return new Response(JSON.stringify({
            market_indices: { items: [] },
            portfolio_today: {
              portfolio_count: 2,
              position_count: 6,
              total_value: 123456,
              position_market_value: 100000,
              cash_amount: 23456,
              day_pnl: 789,
              day_pct: 1.23,
              latest_quote_time: "2026-07-20T07:00:00Z"
            }
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ items: [], total: 0, limit: 30, offset: 0, has_more: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    renderApp();

    expect(await screen.findByText("投研工作台")).toBeInTheDocument();
    expect(screen.getByText("今日组合")).toBeInTheDocument();
    expect(screen.queryByText("组合表现")).not.toBeInTheDocument();
    expect(screen.queryByText("重要资讯")).not.toBeInTheDocument();
    expect(screen.queryByText("未读预警")).not.toBeInTheDocument();
    expect(screen.queryByText("最近笔记")).not.toBeInTheDocument();
    expect(screen.getByText("+1.23%")).toBeInTheDocument();
    expect(screen.queryByText("+123.00%")).not.toBeInTheDocument();
  });

  it("places the compact target portfolio card directly below today's performance", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/portfolios/overview")) {
        return new Response(JSON.stringify({
          portfolio_options: [{ id: 7, name: "成长组合", base_currency: "CNY" }],
          summary: {
            total_value: 200000,
            position_market_value: 180000,
            cash_amount: 20000,
            year_pnl: 12000,
            day_pnl: 1234,
            day_pct: 0.68
          },
          pie_items: [
            { label: "宁德时代", market_value: 72000, weight: 40, current_price: 286.5, day_pct: 1.2, quote_time: "2026-07-29T10:30:00" },
            { label: "贵州茅台", market_value: 54000, weight: 30, current_price: 1420, day_pct: -0.8, quote_time: "2026-07-29T10:30:00" },
            { label: "缺失行情", market_value: 18000, weight: null, day_pct: null }
          ]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/console/workbench-today")) {
        return new Response(JSON.stringify({ market_indices: { items: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ items: [], total: 0, limit: 4, offset: 0, has_more: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }));

    renderApp();
    const portfolioTab = await screen.findByRole("tab", { name: "组合" });
    fireEvent.click(portfolioTab);
    await waitFor(() => expect(portfolioTab).toHaveAttribute("aria-selected", "true"));

    const selector = await screen.findByText("组合选择");
    const today = screen.getByRole("heading", { name: "今日表现" });
    const allocation = screen.getByRole("heading", { name: "标的组合" });
    const treemap = screen.getByRole("heading", { name: "标的热力图" });
    const totalValue = screen.getByText("总市值");

    expect(totalValue.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(today.compareDocumentPosition(allocation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(allocation.compareDocumentPosition(treemap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(treemap.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "标的市值占比" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("刷新标的组合")).not.toBeInTheDocument();
    expect(screen.getByLabelText("标的组合图")).toBeInTheDocument();
    expect(screen.getByLabelText("标的热力图")).toHaveTextContent("宁德时代:286.5:1.2");
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText("+1.2%")).toBeInTheDocument();
    expect(screen.getAllByText("--")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "成长组合" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/portfolios/overview?portfolio_id=7"))).toBe(true));
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/portfolios/overview"))).toHaveLength(2);

    const siblingRequestCount = vi.mocked(fetch).mock.calls.filter(([input]) => (
      /\/api\/(?:console\/workbench-today|market-radar\/rankings|track-discovery\/dashboard|stock-analysis\/dashboard)/.test(String(input))
    )).length;
    const pullRegion = await screen.findByLabelText("组合页下拉刷新");
    fireEvent.touchStart(pullRegion, {
      touches: [{ identifier: 1, clientX: 120, clientY: 100, target: pullRegion }]
    });
    fireEvent.touchMove(pullRegion, {
      touches: [{ identifier: 1, clientX: 122, clientY: 230, target: pullRegion }]
    });
    fireEvent.touchEnd(pullRegion, {
      touches: [],
      changedTouches: [{ identifier: 1, clientX: 122, clientY: 230, target: pullRegion }]
    });

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/portfolios/overview?portfolio_id=7"))).toHaveLength(2));
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/portfolios/overview"))).toHaveLength(3);
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => (
      /\/api\/(?:console\/workbench-today|market-radar\/rankings|track-discovery\/dashboard|stock-analysis\/dashboard)/.test(String(input))
    ))).toHaveLength(siblingRequestCount);
  });

  it("shows a dedicated treemap empty state when the portfolio has no target data", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/dashboard";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/portfolios/overview")) {
        return new Response(JSON.stringify({
          portfolio_options: [],
          summary: { total_value: 0, position_market_value: 0, cash_amount: 0, year_pnl: 0, day_pnl: 0, day_pct: null },
          pie_items: []
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/console/workbench-today")) {
        return new Response(JSON.stringify({ market_indices: { items: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ items: [], total: 0, limit: 4, offset: 0, has_more: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }));

    renderApp();
    const portfolioTab = await screen.findByRole("tab", { name: "组合" });
    fireEvent.click(portfolioTab);
    await waitFor(() => expect(portfolioTab).toHaveAttribute("aria-selected", "true"));

    expect(await screen.findByRole("heading", { name: "标的热力图" })).toBeInTheDocument();
    expect(screen.getByText("暂无标的热力图数据")).toBeInTheDocument();
    expect(screen.queryByLabelText("标的热力图")).not.toBeInTheDocument();
  });

  it.each([
    ["归档笔记", "确认归档笔记", "确认归档", "POST", "/api/knowledge/notes/7/archive"],
    ["删除笔记", "确认删除笔记", "确认删除", "DELETE", "/api/knowledge/notes/7"]
  ])("runs the %s action after in-page confirmation", async (actionLabel, dialogTitle, confirmLabel, method, endpoint) => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/notes/7";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(
        String(input).includes("note-groups")
          ? "[]"
          : JSON.stringify({ id: 7, content: "需要处理的笔记", status: "active", group_id: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ));
    vi.stubGlobal("fetch", fetchMock);

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: actionLabel }));
    expect(screen.getByRole("dialog", { name: dialogTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: confirmLabel }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(endpoint),
      expect.objectContaining({ method })
    ));
  });
});
