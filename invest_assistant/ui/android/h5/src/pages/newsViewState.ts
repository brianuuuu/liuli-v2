import type { NewsTab } from "../api/filters";
import { createReturnSlot } from "../components/listReturn";

/**
 * 资讯页进详情时会被卸载，返回要回到原页签、原作者筛选、原条目位置，
 * 所以记在模块作用域里（只活在当前 SPA 会话内，不落盘）。
 */
const state: { tab: NewsTab; author: string } = {
  tab: "all",
  author: ""
};

export const newsReturn = createReturnSlot<NewsTab>();

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

export function resetNewsViewState() {
  state.tab = "all";
  state.author = "";
  newsReturn.reset();
}
