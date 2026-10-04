import type { NewsTab } from "../api/filters";

/**
 * 资讯页进详情时会被卸载，返回要回到原页签、原作者筛选、原条目位置，
 * 所以记在模块作用域里（只活在当前 SPA 会话内，不落盘）。
 */
export type NewsReturnAnchor = {
  tab: NewsTab;
  itemId: number;
  // 条目顶部离视口顶部的距离；条目找不到时退回整页 scrollY
  offset: number;
  scrollY: number;
};

const state: { tab: NewsTab; author: string; anchor: NewsReturnAnchor | null } = {
  tab: "all",
  author: "",
  anchor: null
};

export function lastNewsTab() {
  return state.tab;
}

export function rememberNewsTab(tab: NewsTab) {
  state.tab = tab;
}

export function lastNewsAuthor() {
  return state.author;
}

export function rememberNewsAuthor(author: string) {
  state.author = author;
}

export function rememberNewsAnchor(anchor: NewsReturnAnchor) {
  state.anchor = anchor;
}

/** 只给对应页签消费一次，消费后清掉，避免后续切页签又被拉回去。 */
export function takeNewsAnchor(tab: NewsTab) {
  const anchor = state.anchor;
  if (!anchor || anchor.tab !== tab) return null;
  state.anchor = null;
  return anchor;
}

export function resetNewsViewState() {
  state.tab = "all";
  state.author = "";
  state.anchor = null;
}
