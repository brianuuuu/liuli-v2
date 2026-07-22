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
    window.sessionStorage.clear();
    window.location.hash = "";
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

  it("shows a note group before its tags on the note card", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/notes";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes("note-groups")
        ? [{ id: 3, name: "投资复盘", sort_order: 0, status: "active" }]
        : { items: [{ id: 9, content: "关注产业链变化", status: "active", group: { id: 3, name: "投资复盘", sort_order: 0, status: "active" }, tags: [{ id: 5, name: "半导体" }] }], total: 1, limit: 30, offset: 0, has_more: false };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    renderApp();

    const group = await screen.findByText("投资复盘", { selector: ".note-card-group" });
    const tag = screen.getByText("#半导体");
    expect(group.compareDocumentPosition(tag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("edits and submits a note's tags", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    window.location.hash = "#/notes/9";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("note-groups")) return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      const note = { id: 9, content: "关注产业链变化", status: "active", tags_text: "半导体", tags: [{ id: 5, name: "半导体" }] };
      return new Response(JSON.stringify(note), { status: init?.method === "PUT" ? 200 : 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    const tagsInput = await screen.findByPlaceholderText("标签，用逗号分隔");
    expect(tagsInput).toHaveValue("半导体");
    fireEvent.change(tagsInput, { target: { value: "半导体, AI 算力" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(putCall).toBeDefined();
      expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({ tags: "半导体, AI 算力" });
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
