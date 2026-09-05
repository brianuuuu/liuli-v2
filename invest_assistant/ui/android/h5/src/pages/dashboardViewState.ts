import type { PoolStatusKey, StockTabView } from "./stockPoolGroups";
import { DEFAULT_POOL_STATUS, DEFAULT_STOCK_TAB_VIEW } from "./stockPoolGroups";

/**
 * 看板的所在位置在离开页面时会被卸载，从标的详情返回时需要回到原来的位置，
 * 所以把它记在模块作用域里（只活在当前 SPA 会话内，不落盘）。
 */
type DashboardViewState = {
  tab: string;
  stockView: StockTabView;
  poolStatus: PoolStatusKey;
};

const state: DashboardViewState = {
  tab: "today",
  stockView: DEFAULT_STOCK_TAB_VIEW,
  poolStatus: DEFAULT_POOL_STATUS
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

export function resetDashboardViewState() {
  state.tab = "today";
  state.stockView = DEFAULT_STOCK_TAB_VIEW;
  state.poolStatus = DEFAULT_POOL_STATUS;
}
