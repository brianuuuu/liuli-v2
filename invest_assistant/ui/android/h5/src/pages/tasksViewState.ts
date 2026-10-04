import { createReturnSlot } from "../components/listReturn";

/**
 * 待办页进详情（笔记、预警、推荐词）时会被卸载，返回要回到原页签和原条目位置，
 * 所以记在模块作用域里（只活在当前 SPA 会话内，不落盘）。
 */
export type TaskTab = "suggestions" | "pending-reports" | "notes" | "alerts";

const state: { tab: TaskTab } = { tab: "suggestions" };

export const tasksReturn = createReturnSlot<TaskTab>();

export function lastTaskTab() {
  return state.tab;
}

export function rememberTaskTab(tab: TaskTab) {
  state.tab = tab;
}

export function resetTasksViewState() {
  state.tab = "suggestions";
  tasksReturn.reset();
}
