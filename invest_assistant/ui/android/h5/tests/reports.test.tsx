import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ReportsPage } from "../src/pages/DetailPages";

afterEach(() => vi.unstubAllGlobals());

function renderReports() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><ReportsPage /></QueryClientProvider></MemoryRouter>);
}

function response(title: string | null) {
  const items = title ? [{ id: 1, title, source_module: "stock_analysis", summary: "报告摘要", created_at: "2026-11-05T12:00:00" }] : [];
  return new Response(JSON.stringify({ items, total: items.length, limit: 50, offset: 0, has_more: false }), { status: 200 });
}

it("按全部、市场、赛道、标的、组合请求服务端筛选，并显示对应报告与空状态", async () => {
  const requests: URL[] = [];
  const filters = [
    { label: "市场", kind: "market", title: "市场报告示例" },
    { label: "赛道", kind: "track", title: null },
    { label: "标的", kind: "stock", title: "标的报告示例" },
    { label: "组合", kind: "portfolio", title: "组合微操报告示例" }
  ];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const kind = url.searchParams.get("report_kind");
    const filter = filters.find((item) => item.kind === kind);
    return response(filter ? filter.title : "全部报告示例");
  }));
  renderReports();
  await screen.findByText("全部报告示例");
  const controls = within(screen.getByRole("group", { name: "报告类型" }));
  for (const { label, kind, title } of filters) {
    fireEvent.click(controls.getByRole("button", { name: label }));
    await screen.findByText(title ?? `暂无${label}报告`);
    expect(controls.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    expect(requests.at(-1)?.searchParams.get("report_kind")).toBe(kind);
    expect(requests.at(-1)?.searchParams.get("offset")).toBe("0");
    expect(screen.queryByText("全部报告示例")).not.toBeInTheDocument();
  }
  fireEvent.click(controls.getByRole("button", { name: "全部" }));
  await screen.findByText("全部报告示例");
  expect(requests[0].searchParams.has("report_kind")).toBe(false);
});

it("某一类型加载失败后可以切换类型或重试", async () => {
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async () => fail ? new Response("{}", { status: 500 }) : response("重试成功报告")));
  renderReports();
  await screen.findByText("加载失败");
  expect(screen.getByRole("group", { name: "报告类型" })).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(screen.getByText("重试成功报告")).toBeInTheDocument());
});
