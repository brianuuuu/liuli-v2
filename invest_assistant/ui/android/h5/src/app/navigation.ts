export type SectionKey = "dashboard" | "news" | "notes" | "tasks" | "me";

export type NavigationItem<T extends string = string> = {
  key: T;
  label: string;
  path: string;
};

export const rootSections: NavigationItem<SectionKey>[] = [
  { key: "dashboard", label: "看板", path: "/dashboard" },
  { key: "news", label: "资讯", path: "/news" },
  { key: "notes", label: "笔记", path: "/notes" },
  { key: "tasks", label: "待办", path: "/tasks" },
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

export function parentPathForDetail(pathname: string): string | null {
  if (/^\/news\/\d+$/.test(pathname)) return "/news";
  if (/^\/notes\/\d+$/.test(pathname)) return "/notes";
  if (/^\/tasks\/alerts\/\d+$/.test(pathname)) return "/tasks";
  if (/^\/reports\/\d+$/.test(pathname)) return "/reports";
  if (pathname === "/reports") return "/dashboard";
  return null;
}
