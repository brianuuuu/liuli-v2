// 组合页与收益分析共用的格式化和图表配色

import { themeColors } from "../../app/themeColors";

export function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(2)}%`;
}

/** 红涨绿跌，走主题变量：深色主题自动换亮一档 */
export function pnlColor(value?: number | null) {
  if (value === null || value === undefined || value === 0) return undefined;
  return value > 0 ? "var(--ll-up)" : "var(--ll-down)";
}

/** ECharts 画在 canvas 上读不到 CSS 变量，按主题给实际色值，与 --ll-up 一致 */
export function upColorForMode(mode: "light" | "dark") {
  return themeColors(mode).up;
}

export function tooltipBackgroundColor(mode: "light" | "dark") {
  return mode === "dark" ? "rgba(13, 17, 23, 0.96)" : "rgba(255, 255, 255, 0.96)";
}
