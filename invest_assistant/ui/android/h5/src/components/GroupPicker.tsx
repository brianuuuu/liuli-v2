import type { NoteGroup } from "../types/api";

/**
 * 笔记分组选择：单选 chip，和 TagPicker 同一套视觉语言。
 *
 * 原来这里是个原生 select。在手机上原生下拉会拉起系统滚轮，看不见全部分组、
 * 也和这一页其他控件长得不一样；分组通常只有几个，直接平铺出来一眼看全、一下点到。
 */
export function GroupPicker({
  groups,
  value,
  onChange
}: {
  groups: NoteGroup[];
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const activeGroups = (Array.isArray(groups) ? groups : []).filter((item) => item.status === "active");
  return (
    <div className="group-picker">
      <span className="group-picker__label">分组</span>
      <div className="group-picker__options" role="radiogroup" aria-label="笔记分组">
        {/* 未分组是一个明确的选项，不是"没选"：外部写入的笔记本来就停在这个状态 */}
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          className={value === null ? "is-active" : ""}
          onClick={() => onChange(null)}
        >
          未分组
        </button>
        {activeGroups.map((group) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === group.id}
            className={value === group.id ? "is-active" : ""}
            key={group.id}
            onClick={() => onChange(group.id)}
          >
            {group.name}
          </button>
        ))}
      </div>
    </div>
  );
}
