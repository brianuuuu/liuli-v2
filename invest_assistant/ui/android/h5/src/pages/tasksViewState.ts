/**
 * 待办页进详情（笔记、预警、推荐词）时会被卸载，返回要回到原页签和原条目位置，
 * 所以记在模块作用域里（只活在当前 SPA 会话内，不落盘）。
 */
export type TaskTab = "suggestions" | "pending-reports" | "notes" | "alerts";

export type AlertReturnAnchor = {
  eventId: number;
  // 条目顶部离视口顶部的距离；条目已处理不在列表里时退回整页 scrollY，下一条自然顶到原位置
  offset: number;
  scrollY: number;
};

const state: { tab: TaskTab; alertAnchor: AlertReturnAnchor | null } = {
  tab: "suggestions",
  alertAnchor: null
};

export function lastTaskTab() {
  return state.tab;
}

export function rememberTaskTab(tab: TaskTab) {
  state.tab = tab;
}

export function rememberAlertAnchor(anchor: AlertReturnAnchor) {
  state.alertAnchor = anchor;
}

/** 只消费一次，避免之后切页签回来又被拉回去。 */
export function takeAlertAnchor() {
  const anchor = state.alertAnchor;
  state.alertAnchor = null;
  return anchor;
}

export function resetTasksViewState() {
  state.tab = "suggestions";
  state.alertAnchor = null;
}
