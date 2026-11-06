import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { TrackDetailPage } from "../src/pages/TrackDetailPage";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderDetail(data: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  client.setQueryData(["track-detail", 1], {
    track: { id: 1, name: "测试赛道", status: "active" },
    summary: { tag_count: 0, material_count: 0, pending_material_count: 0, high_importance_material_count: 0, bound_stock_count: 0 },
    trend_snapshots: [], stocks: [], materials: [], notes: [], ...data,
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tracks/1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/tracks/:id" element={<TrackDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("renders an unscored report and its history without turning missing scores into zero", () => {
  const snapshot = {
    id: 1, track_id: 1, research_date: "2026-11-06", headline_cycle: "short",
    core_judgment: "仅更新短期判断", overall_score: null, track_grade: null, heat_tier: null,
    market_heat_score: null, growth_speed_score: null, concentration_score: null,
    cycle_resilience_score: null, current_market_size_score: null, future_market_size_score: null,
  };
  renderDetail({ latest_snapshot: snapshot, trend_snapshots: [snapshot] });
  expect(screen.getByText("仅更新短期判断")).toBeTruthy();
  expect(screen.queryByText("0.00")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "趋势快照" }));
  expect(screen.getAllByText("综合 —").length).toBeGreaterThan(0);
});

it("keeps independent cycle dates and reveals reasons only when opened", () => {
  renderDetail({
    latest_snapshot: { id: 3, research_date: "2026-11-06", headline_cycle: "short", overall_score: null },
    cycle_views: {
      short: { direction: "uncertain", judgment: "短期等待新订单", confidence: "low", research_date: "2026-11-06", snapshot_id: 3 },
      long: { direction: "positive", judgment: "长期需求持续扩张", confidence: "medium", research_date: "2026-10-03", snapshot_id: 1 },
    },
  });
  const cycles = screen.getByRole("group", { name: "三周期判断" });
  expect(within(cycles).getByText("2026-10-03")).toBeTruthy();
  expect(within(cycles).getByText("2026-11-06")).toBeTruthy();
  expect(within(cycles).getByText("未覆盖")).toBeTruthy();
  const reason = within(cycles).getByText("长期需求持续扩张");
  const details = reason.closest("details")!;
  expect(details).not.toHaveAttribute("open");
  expect(reason).not.toBeVisible();
  fireEvent.click(details.querySelector("summary")!);
  expect(details).toHaveAttribute("open");
  expect(reason).toBeVisible();
  expect(within(details).getByText("置信度：中")).toBeTruthy();
});

it("shows historical score date without copying that score into report history", () => {
  const unscored = { id: 3, track_id: 1, research_date: "2026-11-06", headline_cycle: "short", overall_score: null };
  renderDetail({
    latest_snapshot: unscored, trend_snapshots: [unscored],
    score_snapshot: { id: 1, research_date: "2026-10-03", overall_score: 7.5, track_grade: "A", heat_tier: "T1" },
  });
  expect(screen.getByText("历史评分 2026-10-03")).toBeTruthy();
  expect(screen.getByText("综合 7.5")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "趋势快照" }));
  expect(screen.getByText("综合 —")).toBeTruthy();
});

it("shows due status using Beijing date and ignores dates in old history", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T16:30:00Z"));
  renderDetail({ latest_snapshot: { id: 1, research_date: "2026-11-06", headline_cycle: "short", next_verification_date: "2026-11-07", next_verification: "核对交付" } });
  expect(screen.getByText("2026-11-07 · 今日验证")).toBeTruthy();
  cleanup();
  renderDetail({
    latest_snapshot: { id: 2, research_date: "2026-11-07", headline_cycle: "short", next_verification_date: null },
    trend_snapshots: [{ id: 1, research_date: "2026-10-03", next_verification_date: "2026-11-01" }],
  });
  expect(screen.queryByText(/今日验证|已到期/)).toBeNull();
  expect(screen.queryByRole("group", { name: "三周期判断" })).toBeNull();
});
