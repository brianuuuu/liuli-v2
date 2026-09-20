import type { PoolStatusKey, StockTabView } from "./stockPoolGroups";
import { DEFAULT_POOL_STATUS, DEFAULT_STOCK_TAB_VIEW } from "./stockPoolGroups";
import type { TrackSortKey, TrackStatusKey, TrackTabView } from "./trackLibraryGroups";
import { DEFAULT_TRACK_SORT, DEFAULT_TRACK_STATUS, DEFAULT_TRACK_TAB_VIEW } from "./trackLibraryGroups";

/**
 * 看板的所在位置在离开页面时会被卸载，从标的详情返回时需要回到原来的位置，
 * 所以把它记在模块作用域里（只活在当前 SPA 会话内，不落盘）。
 */
type DashboardViewState = {
  tab: string;
  stockView: StockTabView;
  poolStatus: PoolStatusKey;
  trackView: TrackTabView;
  trackStatus: TrackStatusKey;
  trackSort: TrackSortKey;
};

const state: DashboardViewState = {
  tab: "today",
  stockView: DEFAULT_STOCK_TAB_VIEW,
  poolStatus: DEFAULT_POOL_STATUS,
  trackView: DEFAULT_TRACK_TAB_VIEW,
  trackStatus: DEFAULT_TRACK_STATUS,
  trackSort: DEFAULT_TRACK_SORT
};

export function rememberDashboardTab(tab: string) {
  state.tab = tab;
}

export function lastDashboardTab() {
  return state.tab;
}

export function rememberStockView(view: StockTabView) {
  state.stockView = view;
}

export function lastStockView() {
  return state.stockView;
}

export function rememberPoolStatus(status: PoolStatusKey) {
  state.poolStatus = status;
}

export function lastPoolStatus() {
  return state.poolStatus;
}

export function rememberTrackView(view: TrackTabView) {
  state.trackView = view;
}

export function lastTrackView() {
  return state.trackView;
}

export function rememberTrackStatus(status: TrackStatusKey) {
  state.trackStatus = status;
}

export function lastTrackStatus() {
  return state.trackStatus;
}

export function rememberTrackSort(sort: TrackSortKey) {
  state.trackSort = sort;
}

export function lastTrackSort() {
  return state.trackSort;
}

export function resetDashboardViewState() {
  state.tab = "today";
  state.stockView = DEFAULT_STOCK_TAB_VIEW;
  state.poolStatus = DEFAULT_POOL_STATUS;
  state.trackView = DEFAULT_TRACK_TAB_VIEW;
  state.trackStatus = DEFAULT_TRACK_STATUS;
  state.trackSort = DEFAULT_TRACK_SORT;
}
