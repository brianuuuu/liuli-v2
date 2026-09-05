export type StockChartMode = "light" | "dark";

/**
 * 标的详情页图表统一色板。
 * 基准取自估值页「市值对比趋势」，评分雷达 / 评分趋势沿用同一套值，避免各图样式漂移。
 */
export type StockChartPalette = {
  text: string;
  grid: string;
  accent: string;
  muted: string;
  splitArea: [string, string];
};

export function stockChartPalette(mode: StockChartMode): StockChartPalette {
  const dark = mode === "dark";
  return {
    text: dark ? "#aab2bf" : "#64748b",
    grid: dark ? "#2b333e" : "#e5eaf1",
    accent: dark ? "#60a5fa" : "#2563eb",
    muted: dark ? "#64748b" : "#94a3b8",
    splitArea: dark
      ? ["rgba(96,165,250,0.02)", "rgba(96,165,250,0.05)"]
      : ["rgba(37,99,235,0.01)", "rgba(37,99,235,0.035)"]
  };
}

export const STOCK_CHART_BAR_MAX_WIDTH = 34;
export const STOCK_CHART_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
