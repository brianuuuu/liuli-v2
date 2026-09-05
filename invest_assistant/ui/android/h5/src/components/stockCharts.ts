/**
 * 标的详情图表色板，与 Web 端 stockChartPalette 保持同一套取值，
 * 基准是 Web 估值页的「市值对比趋势」。
 */
export type ChartMode = "light" | "dark";

export function resolveChartMode(): ChartMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function stockChartPalette(mode: ChartMode = resolveChartMode()) {
  const dark = mode === "dark";
  return {
    text: dark ? "#aab2bf" : "#64748b",
    grid: dark ? "#2b333e" : "#e5eaf1",
    accent: dark ? "#60a5fa" : "#2563eb",
    splitArea: dark
      ? ["rgba(96,165,250,0.02)", "rgba(96,165,250,0.05)"]
      : ["rgba(37,99,235,0.01)", "rgba(37,99,235,0.035)"]
  };
}

export const STOCK_CHART_BAR_MAX_WIDTH = 22;
export const STOCK_CHART_BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
