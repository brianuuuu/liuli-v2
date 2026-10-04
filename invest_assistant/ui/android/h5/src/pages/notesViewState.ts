import { createReturnSlot } from "../components/listReturn";

/**
 * 笔记页进详情时会被卸载，返回要回到原分组和原条目位置，
 * 所以记在模块作用域里（只活在当前 SPA 会话内，不落盘）。
 */
const state: { groupId: string } = { groupId: "all" };

export const notesReturn = createReturnSlot<string>();

export function lastNoteGroup() {
  return state.groupId;
}

export function rememberNoteGroup(groupId: string) {
  state.groupId = groupId;
}

export function resetNotesViewState() {
  state.groupId = "all";
  notesReturn.reset();
}
