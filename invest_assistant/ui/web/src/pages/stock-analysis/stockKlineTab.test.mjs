import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("invest_assistant/ui/web/package.json", "utf8"));
const page = readFileSync("invest_assistant/ui/web/src/pages/stock-analysis/StockDetailPage.tsx", "utf8");
const api = readFileSync("invest_assistant/ui/web/src/api/stockAnalysis.ts", "utf8");
const types = readFileSync("invest_assistant/ui/web/src/types/api.ts", "utf8");

if (!packageJson.dependencies["lightweight-charts"]) {
  throw new Error("K-line chart should use lightweight-charts");
}

if (!page.includes('key: "kline"') || !page.includes('label: "行情"')) {
  throw new Error("Stock detail should include a 行情 tab after overview");
}

if (!page.includes("createChart") || !page.includes("CandlestickSeries") || !page.includes("HistogramSeries") || !page.includes("LineSeries")) {
  throw new Error("K-line tab should render candlestick, volume, and MA lines with lightweight-charts");
}

if (!page.includes("useLiuliTheme") || !page.includes("resolvedMode") || !page.includes('resolvedMode === "dark"')) {
  throw new Error("K-line chart should bind to resolved light/dark theme");
}

if (!page.includes("ResizeObserver")) {
  throw new Error("K-line chart should resize with its container");
}

for (const ma of ["ma5", "ma20", "ma60", "ma250"]) {
  if (!page.includes(ma) || !types.includes(`${ma}?: number | null`)) {
    throw new Error(`K-line data should expose and render ${ma}`);
  }
}

if (!api.includes("getStockDailyBars") || !api.includes("/daily-bars")) {
  throw new Error("Stock analysis API client should expose daily-bars endpoint");
}

if (!page.includes("getStockDailyBars") || !page.includes("refresh: true")) {
  throw new Error("K-line tab should load daily bars and provide a refresh action");
}

if (!page.includes("largestVisibleMa") || !page.includes("maVisibleRangeMonths")) {
  throw new Error("MA toggles should choose the visible range by the largest selected MA");
}

if (!page.includes("setVisibleRange")) {
  throw new Error("MA toggles should adjust the chart viewport with setVisibleRange");
}

if (page.includes("getStockDailyBars(stockId, { refresh: visibleMas")) {
  throw new Error("MA toggles should not trigger a data refresh");
}
