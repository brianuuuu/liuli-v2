import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoreContinuityDetails } from "../src/pages/ScoreContinuityDetails";
import { StockDetailPage } from "../src/pages/StockDetailPage";
import { ratingScoreRows } from "../src/pages/stockDetailPresentation";
import type { StockScoreSnapshot } from "../src/types/api";
import { continuityStatus, scoreDelta } from "../../../shared/scoreContinuity";

vi.mock("echarts/core", () => ({
  use: vi.fn(),
  init: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
}));

afterEach(() => vi.restoreAllMocks());

const score = {
  id: 3, stock_id: 1, report_time: "2026-11-07", researcher_code: "analyst_001", investment_level: "A", total_score: 8.5,
  business_moat_score: 8, management_score: 8, governance_score: 8, strategy_score: 8, certainty_score: 8, growth_score: 8,
  report_id: 12, report_available: true, previous_snapshot_id: 1,
  continuity: {
    previous_report_id: 10,
    change_reasons: [{ field: "certainty_score", type: "new_evidence", reason: "回款改善", evidence: ["年报现金流量表"] }],
    previous_checks: [{ report_id: 10, check_id: "cash", result: "pending", reason: "等待年报", evidence: [] }],
    next_checks: [],
  },
  comparison: {
    status: "recorded", baseline_id: 1, report_time: "2026-10-01", report_id: 10, report_available: false,
    previous_level: "A", total_delta: 0.1, method_changed: false,
    dimensions: [
      { field: "certainty_score", previous: 7.5, current: 8, delta: 0.5 },
      { field: "growth_score", previous: 8.7, current: 8, delta: -0.7 },
      { field: "strategy_score", previous: 8, current: 8, delta: 0 }
    ],
  },
  check_sources: [{ report_id: 10, check_id: "cash", condition: "年报现金转化是否改善", source_missing: false, report_available: false }],
} as StockScoreSnapshot;

describe("score continuity", () => {
  it("shows fixed changes, historical conditions, and available report navigation", () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ScoreContinuityDetails score={score} /></MemoryRouter>);
    expect(screen.getByText(/较 2026-10-01/)).toHaveTextContent("+0.10");
    expect(screen.getByText(/确定性/)).toHaveTextContent("7.5 → 8（+0.50）");
    expect(screen.getByText("年报现金转化是否改善")).toBeVisible();
    expect(screen.getByRole("link", { name: "本次报告" })).toHaveAttribute("href", "/reports/12");
    expect(screen.queryByRole("link", { name: "比较报告" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("依据"));
    expect(screen.getByText("年报现金流量表")).toBeVisible();
    expect(screen.queryByText("后续验证")).not.toBeInTheDocument();
  });

  it("distinguishes legacy, deleted baselines, and method uncertainty", () => {
    expect(continuityStatus({})).toBe("未记录连续性");
    expect(continuityStatus(score)).toBe("评分口径未核实");
    expect(continuityStatus({ ...score, comparison: { ...score.comparison!, status: "baseline_missing" } })).toBe("比较来源已删除");
    expect(continuityStatus({ ...score, previous_snapshot_id: null, comparison: { ...score.comparison!, status: "report_only" } })).toBe("比较报告未关联评分");
    expect(scoreDelta(null)).toBe("—");
    expect(scoreDelta(0)).toBe("持平");
    expect(scoreDelta(-0.12)).toBe("-0.12");
  });

  it("keeps a missing linked baseline from being replaced by a nearby historical score", () => {
    const history = [{ ...score, id: 2, report_time: "2026-10-15", growth_score: 9 }];
    const missing = { ...score, comparison: { ...score.comparison!, status: "baseline_missing" as const } };
    expect(ratingScoreRows(missing, history).rows.every(({ delta }) => delta === null)).toBe(true);
  });

  it("keeps same-day versions independently expandable alongside the existing trend", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 390, 844));
    const first = { ...score, id: 1, report_time: "2026-10-01", continuity: null, comparison: null };
    const second = { ...first, id: 2, report_time: score.report_time };
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
    client.setQueryData(["stock-detail", 1], {
      stock: { id: 1, stock_code: "600001", stock_name: "验收样本", status: "active" },
      summary: {}, latest_score: score, score_history: [first, score], valuation_history: [], trend_history: [],
      tracks: [], materials: [], disclosures: [], notes: [], tags: [],
    });
    client.setQueryData(["stock-scores", 1, "1,3"], [score, second, first]);
    render(<QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/stocks/1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/stocks/:id" element={<StockDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "评级" }));
    expect(await screen.findByRole("heading", { name: "评分趋势" })).toBeVisible();
    const scores = screen.getByRole("group", { name: "六维评分，较 2026-10-01" });
    expect(within(scores).getByText("+0.5")).toBeVisible();
    expect(within(scores).getByText("−0.7")).toBeVisible();
    expect(within(scores).getByText("0.0")).toHaveAttribute("data-muted");
    expect(scores.querySelector('[data-direction="up"]')).toHaveStyle({ width: "80%" });
    expect(scores.querySelector('[data-direction="down"]')).toHaveStyle({ width: "87%" });
    const version = screen.getByText(/版本 2/).closest("details")!;
    expect(version).not.toHaveAttribute("open");
    fireEvent.click(version.querySelector("summary")!);
    expect(version).toHaveAttribute("open");
    expect(screen.getByText(/版本 3/)).toBeVisible();
    expect(screen.getByText(/版本 1/)).toBeVisible();
  });
});
