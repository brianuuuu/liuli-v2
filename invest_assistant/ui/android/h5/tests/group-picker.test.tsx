import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupPicker } from "../src/components/GroupPicker";
import type { NoteGroup } from "../src/types/api";

const groups: NoteGroup[] = [
  { id: 1, name: "投资", sort_order: 0, status: "active" },
  { id: 2, name: "复盘", sort_order: 1, status: "active" },
  { id: 9, name: "旧分组", sort_order: 2, status: "archived" }
];

describe("GroupPicker", () => {
  it("平铺可选分组，归档分组不出现", () => {
    render(<GroupPicker groups={groups} value={null} onChange={vi.fn()} />);

    const options = screen.getAllByRole("radio").map((item) => item.textContent);
    // 未分组是一个明确选项，排在最前；归档分组不能再被选中
    expect(options).toEqual(["未分组", "投资", "复盘"]);
    expect(screen.queryByText("旧分组")).not.toBeInTheDocument();
  });

  it("选中项标出来，点其他分组时回调新的 id", () => {
    const onChange = vi.fn();
    render(<GroupPicker groups={groups} value={2} onChange={onChange} />);

    expect(screen.getByRole("radio", { name: "复盘" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "未分组" })).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("radio", { name: "投资" }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("未分组回调 null 而不是 0 或空串", () => {
    const onChange = vi.fn();
    render(<GroupPicker groups={groups} value={1} onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "未分组" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
