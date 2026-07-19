import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HorizontalTabPager,
  type HorizontalTabPagerHandle,
  pagerTargetIndex
} from "../src/components/HorizontalTabPager";

const items = [
  { key: "today", label: "今日" },
  { key: "market", label: "市场" },
  { key: "track", label: "赛道" }
] as const;

describe("horizontal tab pager", () => {
  afterEach(() => vi.useRealTimers());

  it("follows a horizontal drag and selects one adjacent page after release", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={onChange}
        renderPage={(key) => <div>{key}</div>}
      />
    );

    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 312 });
    fireEvent.touchStart(pager, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchMove(pager, { touches: [{ clientX: 180, clientY: 108 }] });
    expect(pager).toHaveStyle({ "--pager-drag-x": "-120px" });
    fireEvent.touchEnd(pager, { changedTouches: [{ clientX: 180, clientY: 108 }] });

    expect(onChange).not.toHaveBeenCalled();
    expect(pager).toHaveStyle({ "--pager-drag-x": "-312px" });
    vi.advanceTimersByTime(220);
    expect(onChange).toHaveBeenCalledWith("track");
  });

  it("routes navigation clicks through the same settling transition", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const ref = createRef<HorizontalTabPagerHandle<(typeof items)[number]["key"]>>();
    render(
      <HorizontalTabPager
        ref={ref}
        items={items}
        activeKey="today"
        onChange={onChange}
        renderPage={(key) => <div>{key}</div>}
      />
    );

    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 320 });
    act(() => ref.current?.requestChange("market"));

    expect(onChange).not.toHaveBeenCalled();
    expect(pager).toHaveClass("is-settling");
    expect(pager).toHaveStyle({ "--pager-drag-x": "-320px" });
    vi.advanceTimersByTime(220);
    expect(onChange).toHaveBeenCalledWith("market");
  });

  it("ignores another navigation request while a transition is being scheduled", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const ref = createRef<HorizontalTabPagerHandle<(typeof items)[number]["key"]>>();
    render(
      <HorizontalTabPager
        ref={ref}
        items={items}
        activeKey="today"
        onChange={onChange}
        renderPage={(key) => <div>{key}</div>}
      />
    );

    act(() => {
      ref.current?.requestChange("track");
      ref.current?.requestChange("market");
    });
    act(() => vi.runAllTimers());

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("track");
  });

  it("springs back for short or primarily vertical movement", () => {
    expect(pagerTargetIndex(1, 3, { deltaX: -40, deltaY: 2 })).toBe(1);
    expect(pagerTargetIndex(1, 3, { deltaX: -100, deltaY: 130 })).toBe(1);
    expect(pagerTargetIndex(1, 3, { deltaX: -100, deltaY: 20 })).toBe(2);
  });

  it("stops at the first and last page", () => {
    expect(pagerTargetIndex(0, 3, { deltaX: 100, deltaY: 0 })).toBe(0);
    expect(pagerTargetIndex(2, 3, { deltaX: -100, deltaY: 0 })).toBe(2);
  });

  it("does not take horizontal gestures from an editor", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={onChange}
        renderPage={(key) => <textarea aria-label={`编辑-${key}`} />}
      />
    );

    const editor = screen.getByRole("textbox", { name: "编辑-market" });
    fireEvent.touchStart(editor, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchMove(editor, { touches: [{ clientX: 150, clientY: 105 }] });
    fireEvent.touchEnd(editor, { changedTouches: [{ clientX: 150, clientY: 105 }] });
    vi.advanceTimersByTime(220);

    expect(onChange).not.toHaveBeenCalled();
  });
});
