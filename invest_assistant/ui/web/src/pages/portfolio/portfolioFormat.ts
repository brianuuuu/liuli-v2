// 组合页与收益分析共用的格式化和图表配色

export function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(2)}%`;
}

export function pnlColor(value?: number | null) {
  if (value === null || value === undefined || value === 0) return undefined;
  return value > 0 ? "#b42318" : "#047857";
}

export function tooltipBackgroundColor(mode: "light" | "dark") {
  return mode === "dark" ? "rgba(13, 17, 23, 0.96)" : "rgba(255, 255, 255, 0.96)";
}
