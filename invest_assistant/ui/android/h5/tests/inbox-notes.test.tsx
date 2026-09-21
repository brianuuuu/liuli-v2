import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
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
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <InboxNotesPanel />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

function stubFetch(groups: Array<{ id: number; name: string; sort_order: number; status: string }>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/knowledge/note-groups")) return jsonResponse(groups);
    if (url.includes("/api/knowledge/notes/31")) return jsonResponse({ ...inboxNote, group_id: 2 });
    if (url.includes("/api/knowledge/notes")) {
      return jsonResponse({ items: [inboxNote], total: 1, limit: 30, offset: 0, has_more: false });
    }
    void init;
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
    const fetchMock = stubFetch([{ id: 2, name: "投资", sort_order: 0, status: "active" }]);

    renderPanel();

    expect(await screen.findByText("光伏产能出清比预期慢，别急着抄底")).toBeInTheDocument();
    expect(screen.getByText("外部写入")).toBeInTheDocument();
    // 待办的口径是"外部输入等我处理"：自己随手记的未分组笔记不进这里，
    // 所以 ungrouped 和 note_type 两个条件必须同时带上。
    const listUrl = fetchMock.mock.calls.map((call) => String(call[0])).find((url) => url.includes("/api/knowledge/notes?"));
    expect(listUrl).toContain("ungrouped=true");
    expect(listUrl).toContain("note_type=mcp");
  });

  it("就地归入分组后把笔记从待办移走", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    const fetchMock = stubFetch([
      { id: 2, name: "投资", sort_order: 0, status: "active" },
      { id: 3, name: "复盘", sort_order: 1, status: "active" }
    ]);

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "归入分组" }));
    fireEvent.click(await screen.findByRole("button", { name: "复盘" }));

    await waitFor(() => expect(screen.getByText("已归入「复盘」")).toBeInTheDocument());
    const update = fetchMock.mock.calls.find((call) => String(call[0]).includes("/api/knowledge/notes/31"));
    expect(update?.[1]?.method).toBe("PUT");
    const body = JSON.parse(String(update?.[1]?.body));
    expect(body.group_id).toBe(3);
    // 归组只改分组，正文原样带回去
    expect(body.content).toBe("光伏产能出清比预期慢，别急着抄底");
  });

  it("还没有分组时不让归组，先去建分组", async () => {
    window.localStorage.setItem(tokenStorageKey, "token");
    stubFetch([]);

    renderPanel();

    const action = await screen.findByRole("button", { name: "先去建分组" });
    expect(action).toBeDisabled();
  });
});
