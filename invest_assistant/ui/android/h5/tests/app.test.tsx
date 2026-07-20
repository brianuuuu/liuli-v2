import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HashRouter } from "react-router-dom";
import { MobileApp } from "../src/app/MobileApp";
import { tokenStorageKey } from "../src/api/client";

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

describe("mobile H5 app", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "";
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
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

    expect(await screen.findByText("admin")).toBeInTheDocument();
    expect(screen.queryByText("brian")).not.toBeInTheDocument();
  });

  it("renders every cached major index on the today dashboard", async () => {
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

    expect(await screen.findByText("上证指数")).toBeInTheDocument();
    expect(screen.getByText("深证成指")).toBeInTheDocument();
    await waitFor(() => {
      const rankingUrl = fetchMock.mock.calls.map(([input]) => String(input)).find((url) => url.includes("/rankings"));
      expect(rankingUrl).toContain("type=all");
    });
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
    fireEvent.click(await screen.findByRole("button", { name: "已处理" }));

    expect(await screen.findByText("已处理事件")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("offset=50"))).toBe(true);
  });

  it("renders tasks with alerts and AI recommendation as secondary items", async () => {
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

    expect(await screen.findByRole("tab", { name: "预警" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI 推荐词" })).toBeInTheDocument();
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

    expect(await screen.findByText("组合表现")).toBeInTheDocument();
    expect(screen.getByText("+1.23%")).toBeInTheDocument();
    expect(screen.queryByText("+123.00%")).not.toBeInTheDocument();
  });

  it("offers archive and delete actions on a note detail", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/notes/7";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => new Response(
        String(input).includes("note-groups")
          ? "[]"
          : JSON.stringify({ id: 7, content: "需要处理的笔记", status: "active", group_id: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ))
    );

    renderApp();

    expect(await screen.findByRole("button", { name: "归档笔记" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除笔记" })).toBeInTheDocument();
  });
});
