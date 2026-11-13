import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

it("按全部、市场、赛道、标的、组合、其他请求服务端筛选，并显示对应报告与空状态", async () => {
  const requests: URL[] = [];
  const filters = [
    { label: "市场", kind: "market", title: "市场报告示例" },
    { label: "赛道", kind: "track", title: null },
    { label: "标的", kind: "stock", title: "标的报告示例" },
    { label: "组合", kind: "portfolio", title: "组合微操报告示例" },
    { label: "其他", kind: "other", title: "专题观察报告示例" }
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

function pageResponse(ids: number[], offset: number, hasMore: boolean) {
  const items = ids.map((id) => ({ id, title: `专题报告 ${id}`, source_module: "knowledge_base", summary: "报告摘要", created_at: "2026-11-13T12:00:00" }));
  return new Response(JSON.stringify({ items, total: 51, limit: 50, offset, has_more: hasMore }), { status: 200 });
}

it("点击底部加载更多追加下一页、去重，并在末页隐藏按钮", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const offset = Number(url.searchParams.get("offset"));
    return offset === 0 ? pageResponse(Array.from({ length: 50 }, (_, i) => i + 1), 0, true) : pageResponse([50, 51], offset, false);
  }));
  renderReports();
  await screen.findByText("专题报告 1");
  expect(requests).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await screen.findByText("专题报告 51");
  expect(screen.getByText("专题报告 1")).toBeInTheDocument();
  expect(screen.getAllByText("专题报告 50")).toHaveLength(1);
  expect(requests.at(-1)?.searchParams.get("offset")).toBe("50");
  expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument();
});

it("其他分类分页失败保留已加载报告，重试沿用分类和偏移量", async () => {
  const requests: URL[] = [];
  let failNextPage = true;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    if (!url.searchParams.has("report_kind")) return response("全部报告示例");
    const offset = Number(url.searchParams.get("offset"));
    if (!offset) return pageResponse(Array.from({ length: 50 }, (_, i) => i + 1), 0, true);
    return failNextPage ? new Response("{}", { status: 500 }) : pageResponse([51], offset, false);
  }));
  renderReports();
  await screen.findByText("全部报告示例");
  fireEvent.click(screen.getByRole("button", { name: "其他" }));
  await screen.findByText("专题报告 1");
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await screen.findByRole("button", { name: "重试加载" });
  expect(screen.getByText("专题报告 1")).toBeInTheDocument();
  expect(screen.queryByText("全部报告示例")).not.toBeInTheDocument();
  failNextPage = false;
  fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
  await screen.findByText("专题报告 51");
  expect(requests.slice(-2).map((url) => [url.searchParams.get("report_kind"), url.searchParams.get("offset")])).toEqual([["other", "50"], ["other", "50"]]);
});

it("加载更多期间禁用按钮，切换分类不会混入上一类的后续结果", async () => {
  let resolveNextPage!: (response: Response) => void;
  const nextPage = new Promise<Response>((resolve) => { resolveNextPage = resolve; });
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.searchParams.get("report_kind") === "other") return response("其他报告示例");
    return Number(url.searchParams.get("offset")) ? nextPage : pageResponse([1], 0, true);
  });
  vi.stubGlobal("fetch", fetchMock);
  renderReports();
  await screen.findByText("专题报告 1");
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  expect(await screen.findByRole("button", { name: "加载中…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "加载中…" }));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "其他" }));
  await screen.findByText("其他报告示例");
  await act(async () => { resolveNextPage(pageResponse([2], 1, false)); await nextPage; });
  expect(screen.queryByText("专题报告 2")).not.toBeInTheDocument();
  expect(screen.queryByText("专题报告 1")).not.toBeInTheDocument();
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
