type ResolvedThemeMode = "light" | "dark";

/**
 * 图表和 antd 用的主题色，取值与 global.css 里同名的 --ll-* 变量一致（text2 是图表专用的次级文字色）。
 * fill* 是实心按钮底色：accent 适合做文字和选中态，直接当底色在深色下太亮、白字发虚。
 * DOM 上直接写 var(--ll-*)；ECharts 画在 canvas 上读不到 CSS 变量，才从这里取。
 * 改色时两边一起改。
 */
const palettes = {
  light: {
    panel: "#ffffff",
    panelSubtle: "#f8fafc",
    text: "#0f172a",
    text2: "#334155",
    muted: "#64748b",
    border: "#e2e8f0",
    borderSoft: "#f1f5f9",
    accent: "#2563eb",
    up: "#b42318",
    fill: "#2563eb",
    fillHover: "#1d4ed8",
    fillActive: "#1e40af"
  },
  dark: {
    panel: "#161b22",
    panelSubtle: "#21262d",
    text: "#e6edf3",
    text2: "#c9d1d9",
    muted: "#8b949e",
    border: "rgba(255, 255, 255, 0.1)",
    borderSoft: "rgba(255, 255, 255, 0.06)",
    accent: "#4493f8",
    up: "#f87171",
    fill: "#1f6feb",
    fillHover: "#388bfd",
    fillActive: "#1158c7"
  }
};

export function themeColors(mode: ResolvedThemeMode) {
  return palettes[mode];
}

/** antd 组件的字体栈，与 global.css :root 保持一致 */
export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
