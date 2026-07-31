import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function renderGroups(onReorder = vi.fn(async () => undefined)) {
  render(
    <ReorderableNoteGroups
      groups={groups}
      disabled={false}
      onReorder={onReorder}
      onArchive={vi.fn(async () => undefined)}
    />
  );
  setRowRects();
  return onReorder;
}

describe("ReorderableNoteGroups", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not reorder when the press ends before 350ms", () => {
    const onReorder = renderGroups();
    const row = screen.getByTestId("note-group-1");

    fireEvent.pointerDown(row, { pointerId: 1, clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(349));
    fireEvent.pointerUp(row, { pointerId: 1, clientX: 20, clientY: 20 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("cancels a pending long press when the finger moves vertically", () => {
    const onReorder = renderGroups();
    const row = screen.getByTestId("note-group-1");

    fireEvent.pointerDown(row, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(row, { pointerId: 2, clientX: 20, clientY: 40 });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerUp(row, { pointerId: 2, clientX: 20, clientY: 40 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not save when a long press ends without changing position", () => {
    const onReorder = renderGroups();
    const row = screen.getByTestId("note-group-1");

    fireEvent.pointerDown(row, { pointerId: 5, clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(350));
    fireEvent.pointerUp(row, { pointerId: 5, clientX: 20, clientY: 20 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it.each([
    { name: "downward", sourceId: 1, startY: 20, endY: 75, expected: [2, 1, 3] },
    { name: "upward", sourceId: 3, startY: 110, endY: 20, expected: [3, 1, 2] }
  ])("persists the complete order after an activated $name drag", ({ sourceId, startY, endY, expected }) => {
    const onReorder = renderGroups();
    const row = screen.getByTestId(`note-group-${sourceId}`);

    fireEvent.pointerDown(row, { pointerId: 3, clientX: 20, clientY: startY });
    act(() => vi.advanceTimersByTime(350));
    fireEvent.pointerMove(row, { pointerId: 3, clientX: 20, clientY: endY });
    fireEvent.pointerUp(row, { pointerId: 3, clientX: 20, clientY: endY });

    expect(onReorder).toHaveBeenCalledWith(expected);
  });

  it("never starts dragging from the remove button", () => {
    const onReorder = renderGroups();
    const remove = screen.getByRole("button", { name: "移除复盘" });

    fireEvent.pointerDown(remove, { pointerId: 4, clientX: 250, clientY: 20 });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerMove(remove, { pointerId: 4, clientX: 250, clientY: 75 });
    fireEvent.pointerUp(remove, { pointerId: 4, clientX: 250, clientY: 75 });

    expect(onReorder).not.toHaveBeenCalled();
  });
});
