import type { ReactNode } from "react";

/**
 * 筛选按钮上的"名称 + 计数"。计数不加括号：括号比数字高、还下伸到基线以下，
 * 放在一起数字看着总是偏上；改成浅色小号等宽数字，跟随按钮的选中色。
 */
export function CountLabel({ label, count }: { label: ReactNode; count?: number | null }) {
  return (
    <>
      {label}
      {count == null ? null : <span className="count-label-num">{count}</span>}
    </>
  );
}
