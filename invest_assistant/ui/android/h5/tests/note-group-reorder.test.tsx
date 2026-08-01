import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReorderableNoteGroups } from "../src/components/ReorderableNoteGroups";
import type { NoteGroup } from "../src/types/api";

const groups: NoteGroup[] = [
  { id: 1, name: "复盘", sort_order: 0, status: "active" },
  { id: 2, name: "原则", sort_order: 1, status: "active" },
  { id: 3, name: "案例", sort_order: 2, status: "active" }
];

function setRowRects() {
  groups.forEach((group, index) => {
    vi.spyOn(screen.getByTestId(`note-group-${group.id}`), "getBoundingClientRect").mockReturnValue({
      top: index * 44,
      bottom: (index + 1) * 44,
      height: 44,
      left: 0,
      right: 300,
      width: 300,
      x: 0,
      y: index * 44,
      toJSON: () => undefined
    });
  });
}

function renderGroups({
  onReorder = vi.fn(async () => undefined),
  onRename = vi.fn(async () => undefined)
} = {}) {
  render(
    <ReorderableNoteGroups
      groups={groups}
      disabled={false}
      onReorder={onReorder}
      onRename={onRename}
      onArchive={vi.fn(async () => undefined)}
    />
  );
  setRowRects();
  return { onRename, onReorder };
}

describe("ReorderableNoteGroups", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reserves visible sheet height for every rendered group row", () => {
    renderGroups();

    expect(screen.getByTestId("note-group-1").parentElement).toHaveStyle({
      height: "129px"
    });
  });

  it("does not save when the drag handle is released without changing position", () => {
    const { onReorder } = renderGroups();
    const handle = screen.getByRole("button", { name: "调整复盘顺序" });

    fireEvent.pointerDown(handle, { pointerId: 5, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(handle, { pointerId: 5, clientX: 20, clientY: 20 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it.each([
    { name: "downward", sourceId: 1, startY: 20, endY: 75, expected: [2, 1, 3] },
    { name: "upward", sourceId: 3, startY: 110, endY: 20, expected: [3, 1, 2] }
  ])("persists the complete order after a direct $name handle drag", ({ sourceId, startY, endY, expected }) => {
    const { onReorder } = renderGroups();
    const groupName = groups.find((group) => group.id === sourceId)?.name;
    const handle = screen.getByRole("button", { name: `调整${groupName}顺序` });

    fireEvent.pointerDown(handle, { pointerId: 3, clientX: 20, clientY: startY });
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: 20, clientY: endY });
    fireEvent.pointerUp(handle, { pointerId: 3, clientX: 20, clientY: endY });

    expect(onReorder).toHaveBeenCalledWith(expected);
  });

  it("edits a group name inline and saves the trimmed value", () => {
    const { onRename } = renderGroups();

    fireEvent.click(screen.getByRole("button", { name: "编辑复盘" }));
    const input = screen.getByRole("textbox", { name: "分组名称" });
    fireEvent.change(input, { target: { value: "  每周复盘  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存分组名称" }));

    expect(onRename).toHaveBeenCalledWith(groups[0], "每周复盘");
  });

  it("never starts dragging from the remove button", () => {
    const { onReorder } = renderGroups();
    const remove = screen.getByRole("button", { name: "移除复盘" });

    fireEvent.pointerDown(remove, { pointerId: 4, clientX: 250, clientY: 20 });
    fireEvent.pointerMove(remove, { pointerId: 4, clientX: 250, clientY: 75 });
    fireEvent.pointerUp(remove, { pointerId: 4, clientX: 250, clientY: 75 });

    expect(onReorder).not.toHaveBeenCalled();
  });
});
