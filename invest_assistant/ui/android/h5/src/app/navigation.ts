export type SectionKey = "dashboard" | "notes" | "news" | "alerts" | "me";

export type NavigationItem<T extends string = string> = {
  key: T;
  label: string;
  path: string;
};

export const rootSections: NavigationItem<SectionKey>[] = [
  { key: "dashboard", label: "看板", path: "/dashboard" },
  { key: "notes", label: "笔记", path: "/notes" },
  { key: "news", label: "新闻", path: "/news" },
  { key: "alerts", label: "预警", path: "/alerts" },
  { key: "me", label: "我的", path: "/me" }
];

export const dashboardTabs = [
  { key: "today", label: "今日" },
  { key: "market", label: "市场" },
  { key: "track", label: "赛道" },
  { key: "stock", label: "标的" },
  { key: "portfolio", label: "组合" }
] as const;

export function sectionForPath(pathname: string): SectionKey {
  const direct = rootSections.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`));
  if (direct) return direct.key;
  if (pathname.startsWith("/reports/")) return "dashboard";
  return "dashboard";
}
