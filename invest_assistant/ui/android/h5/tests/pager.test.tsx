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
  afterEach(() => {
    delete window.LiuliNative;
    Reflect.deleteProperty(document, "elementFromPoint");
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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

  it("handles a horizontal drag that starts on the surrounding content surface", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <div data-testid="content-surface">
        <HorizontalTabPager
          items={items}
          activeKey="market"
          onChange={onChange}
          renderPage={(key) => <div>{key}</div>}
        />
      </div>
    );

    const surface = screen.getByTestId("content-surface");
    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 312 });
    fireEvent.touchStart(surface, { touches: [{ clientX: 300, clientY: 600 }] });
    fireEvent.touchMove(surface, { touches: [{ clientX: 180, clientY: 608 }] });
    fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 180, clientY: 608 }] });
    vi.advanceTimersByTime(220);

    expect(onChange).toHaveBeenCalledWith("track");
  });

  it("marks the surrounding content surface for horizontal gesture handling and cleans it up", () => {
    const { unmount } = render(
      <div data-testid="content-surface">
        <HorizontalTabPager
          items={items}
          activeKey="market"
          onChange={vi.fn()}
          renderPage={(key) => <div>{key}</div>}
        />
      </div>
    );

    const surface = screen.getByTestId("content-surface");
    expect(surface).toHaveClass("horizontal-tab-pager-surface");

    unmount();
    expect(surface).not.toHaveClass("horizontal-tab-pager-surface");
  });

  it("does not take gestures from a sibling action outside the pager", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <div>
        <HorizontalTabPager
          items={items}
          activeKey="market"
          onChange={onChange}
          renderPage={(key) => <div>{key}</div>}
        />
        <button type="button" aria-label="新增笔记">+</button>
      </div>
    );

    const action = screen.getByRole("button", { name: "新增笔记" });
    fireEvent.touchStart(action, { touches: [{ clientX: 300, clientY: 600 }] });
    fireEvent.touchMove(action, { touches: [{ clientX: 180, clientY: 608 }] });
    fireEvent.touchEnd(action, { changedTouches: [{ clientX: 180, clientY: 608 }] });
    vi.advanceTimersByTime(220);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses native swipe events without intercepting WebView touch scrolling", () => {
    vi.useFakeTimers();
    window.LiuliNative = {};
    const onChange = vi.fn();
    const onMotionChange = vi.fn();
    render(
      <div data-testid="content-surface">
        <HorizontalTabPager
          items={items}
          activeKey="market"
          onChange={onChange}
          onMotionChange={onMotionChange}
          renderPage={(key) => <div>{key}</div>}
        />
      </div>
    );

    const surface = screen.getByTestId("content-surface");
    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 312 });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      top: 40,
      right: 360,
      bottom: 760,
      left: 0,
      width: 360,
      height: 720,
      x: 0,
      y: 40,
      toJSON: () => undefined
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => pager)
    });

    fireEvent.touchStart(document.body, { touches: [{ clientX: 300, clientY: 500 }] });
    let horizontalMovePrevented: boolean | null = null;
    document.body.addEventListener("touchmove", (event) => {
      horizontalMovePrevented = event.defaultPrevented;
    }, { once: true });
    fireEvent.touchMove(document.body, { touches: [{ clientX: 180, clientY: 508 }] });

    expect(horizontalMovePrevented).toBe(false);
    expect(pager).toHaveStyle({ "--pager-drag-x": "-120px" });
    expect(onMotionChange).toHaveBeenLastCalledWith({
      fromIndex: 1,
      toIndex: 2,
      progress: 120 / 312
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("liuli:native-swipe", {
        detail: { outcome: "next" }
      }));
    });
    expect(pager).toHaveStyle({ "--pager-drag-x": "-312px" });
    expect(pager.style.getPropertyValue("--pager-settle-duration")).toBe("135ms");
    act(() => vi.advanceTimersByTime(135));

    expect(onChange).toHaveBeenCalledWith("track");
  });

  it("springs a native drag back when the shell cancels it", () => {
    vi.useFakeTimers();
    window.LiuliNative = {};
    render(
      <div data-testid="content-surface">
        <HorizontalTabPager
          items={items}
          activeKey="market"
          onChange={vi.fn()}
          renderPage={(key) => <div>{key}</div>}
        />
      </div>
    );

    const surface = screen.getByTestId("content-surface");
    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 312 });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      top: 40,
      right: 360,
      bottom: 760,
      left: 0,
      width: 360,
      height: 720,
      x: 0,
      y: 40,
      toJSON: () => undefined
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => pager)
    });

    fireEvent.touchStart(document.body, { touches: [{ clientX: 300, clientY: 500 }] });
    fireEvent.touchMove(document.body, { touches: [{ clientX: 220, clientY: 506 }] });
    expect(pager).toHaveStyle({ "--pager-drag-x": "-80px" });

    act(() => {
      window.dispatchEvent(new CustomEvent("liuli:native-swipe", {
        detail: { outcome: "cancel" }
      }));
    });

    expect(pager).toHaveClass("is-settling");
    expect(pager).toHaveStyle({ "--pager-drag-x": "0px" });
    expect(pager.style.getPropertyValue("--pager-settle-duration")).toBe("120ms");
  });

  it("ignores a native swipe that starts on an action button", () => {
    vi.useFakeTimers();
    window.LiuliNative = {};
    const onChange = vi.fn();
    render(
      <div data-testid="content-surface">
        <HorizontalTabPager
          items={items}
          activeKey="market"
          onChange={onChange}
          renderPage={(key) => <button type="button">{key}</button>}
        />
      </div>
    );

    const surface = screen.getByTestId("content-surface");
    const pager = screen.getByTestId("horizontal-tab-pager");
    const action = screen.getByRole("button", { name: "market" });
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 312 });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      top: 40,
      right: 360,
      bottom: 760,
      left: 0,
      width: 360,
      height: 720,
      x: 0,
      y: 40,
      toJSON: () => undefined
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => action)
    });

    fireEvent.touchStart(action, { touches: [{ clientX: 300, clientY: 500 }] });
    fireEvent.touchMove(action, { touches: [{ clientX: 160, clientY: 506 }] });
    act(() => {
      window.dispatchEvent(new CustomEvent("liuli:native-swipe", {
        detail: { outcome: "next" }
      }));
      vi.advanceTimersByTime(220);
    });

    expect(pager).toHaveStyle({ "--pager-drag-x": "0px" });
    expect(onChange).not.toHaveBeenCalled();
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
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
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
    act(() => vi.advanceTimersByTime(220));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("track");
  });

  it("springs back for short or primarily vertical movement", () => {
    expect(pagerTargetIndex(1, 3, { deltaX: -40, deltaY: 2 })).toBe(1);
    expect(pagerTargetIndex(1, 3, { deltaX: -100, deltaY: 130 })).toBe(1);
    expect(pagerTargetIndex(1, 3, { deltaX: -100, deltaY: 20 })).toBe(2);
  });

  it("does not lock a near-diagonal upward gesture to the horizontal axis", () => {
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
    fireEvent.touchStart(pager, { touches: [{ clientX: 300, clientY: 300 }] });
    fireEvent.touchMove(pager, { touches: [{ clientX: 291, clientY: 292 }] });
    expect(pager).toHaveStyle({ "--pager-drag-x": "0px" });

    fireEvent.touchMove(pager, { touches: [{ clientX: 280, clientY: 260 }] });
    fireEvent.touchEnd(pager, { changedTouches: [{ clientX: 280, clientY: 260 }] });
    expect(onChange).not.toHaveBeenCalled();
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
