import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InboxNotesPanel } from "../src/pages/InboxNotesPanel";
import { tokenStorageKey } from "../src/api/client";

const inboxNote = {
  id: 31,
  title: "光伏产能出清比预期慢，别急着抄底",
  content: "光伏产能出清比预期慢，别急着抄底",
  note_type: "mcp",
  group_id: null,
  status: "active",
  created_at: "2026-09-21T10:00:00+08:00",
  updated_at: "2026-09-21T10:00:00+08:00",
  tags: []
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/tasks"]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/tasks" element={<InboxNotesPanel />} />
          <Route path="/notes/:id" element={<div>笔记编辑页</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

function stubFetch(items = [inboxNote]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/knowledge/notes")) {
      return jsonResponse({ items, total: items.length, limit: 30, offset: 0, has_more: false });
    }
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("待办 · 待归档笔记", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("只查 MCP 写入的未分组笔记", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    const fetchMock = stubFetch();

    renderPanel();

    expect(await screen.findByText("光伏产能出清比预期慢，别急着抄底")).toBeInTheDocument();
    expect(screen.getByText("外部写入")).toBeInTheDocument();
    // 待办的口径是"外部输入等我处理"：自己随手记的未分组笔记不进这里，
    // 所以 ungrouped 和 note_type 两个条件必须同时带上。
    const listUrl = fetchMock.mock.calls.map((call) => String(call[0])).find((url) => url.includes("/api/knowledge/notes?"));
    expect(listUrl).toContain("ungrouped=true");
    expect(listUrl).toContain("note_type=mcp");
  });

  it("整卡点开去笔记编辑页，卡片上不挂只能改分组的按钮", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    stubFetch();

    renderPanel();

    // 分组和标签在编辑页能一次改完，卡片上再挂一个只能改分组的按钮既占地方又少一半能力
    expect(await screen.findByText("光伏产能出清比预期慢，别急着抄底")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "归入分组" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("光伏产能出清比预期慢，别急着抄底"));
    await waitFor(() => expect(screen.getByText("笔记编辑页")).toBeInTheDocument());
  });

  it("没有待归档笔记时给空态", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    stubFetch([]);

    renderPanel();

    expect(await screen.findByText("没有待归档的笔记")).toBeInTheDocument();
  });
});
