import React, { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HorizontalTabPager,
  type HorizontalTabPagerHandle,
  pagerTargetIndex
} from "../src/components/HorizontalTabPager";
import { touchPagerCache } from "../src/components/pagerCache";

const items = [
  { key: "today", label: "今日" },
  { key: "market", label: "市场" },
  { key: "track", label: "赛道" }
] as const;

function pointerSwipe(
  target: Element,
  {
    fromX = 300,
    toX = 180,
    fromY = 500,
    toY = 508,
    pointerId = 7,
    cancel = false
  } = {}
) {
  fireEvent.pointerDown(target, {
    pointerId,
    pointerType: "touch",
    isPrimary: true,
    clientX: fromX,
    clientY: fromY
  });
  act(() => vi.advanceTimersByTime(120));
  fireEvent.pointerMove(target, {
    pointerId,
    pointerType: "touch",
    isPrimary: true,
    clientX: toX,
    clientY: toY
  });
  act(() => vi.advanceTimersByTime(20));
  fireEvent[ cancel ? "pointerCancel" : "pointerUp" ](target, {
    pointerId,
    pointerType: "touch",
    isPrimary: true,
    clientX: toX,
    clientY: toY
  });
}

describe("horizontal tab pager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("follows one document pointer gesture and selects one adjacent page", () => {
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
    fireEvent.pointerDown(pager, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 300,
      clientY: 100
    });
    fireEvent.pointerMove(pager, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 180,
      clientY: 108
    });
    act(() => vi.advanceTimersByTime(20));
    expect(pager).toHaveStyle({ "--pager-drag-x": "-120px" });
    fireEvent.pointerUp(pager, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 180,
      clientY: 108
    });
    act(() => vi.advanceTimersByTime(20));

    expect(onChange).not.toHaveBeenCalled();
    expect(pager).toHaveStyle({ "--pager-drag-x": "-312px" });
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledWith("track");
  });

  it("mounts only the active page initially and keeps at most three recent pages", () => {
    vi.useFakeTimers();
    const fourItems = [
      ...items,
      { key: "portfolio", label: "组合" }
    ] as const;
    const ref = createRef<HorizontalTabPagerHandle<(typeof fourItems)[number]["key"]>>();

    function PagerHarness() {
      const [activeKey, setActiveKey] = React.useState<(typeof fourItems)[number]["key"]>("today");
      return (
        <HorizontalTabPager
          ref={ref}
          items={fourItems}
          activeKey={activeKey}
          onChange={setActiveKey}
          renderPage={(key) => <input aria-label={key} defaultValue={key} />}
        />
      );
    }

    const { container } = render(<PagerHarness />);
    expect(container.querySelectorAll("input")).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "today" }), {
      target: { value: "preserved" }
    });

    for (const key of ["market", "track"] as const) {
      act(() => ref.current?.requestChange(key));
      act(() => vi.advanceTimersByTime(300));
    }
    act(() => ref.current?.requestChange("market"));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByLabelText("market")).toBeInTheDocument();

    act(() => ref.current?.requestChange("portfolio"));
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelectorAll("input")).toHaveLength(3);
    expect(screen.queryByLabelText("today")).not.toBeInTheDocument();
  });

  it("keeps body whitespace swipe working and ignores the retired native event", () => {
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

    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 312 });
    pointerSwipe(document.body);
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("track");

    act(() => {
      window.dispatchEvent(new CustomEvent("liuli:native-swipe", {
        detail: { outcome: "next" }
      }));
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("publishes pointer motion without rendering page content on each frame", () => {
    vi.useFakeTimers();
    const renderPage = vi.fn((key: string) => <div>{key}</div>);
    const setMotion = vi.fn();
    const motionSink = { current: { setMotion } };
    render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={vi.fn()}
        motionSink={motionSink}
        renderPage={renderPage}
      />
    );

    const pager = screen.getByTestId("horizontal-tab-pager");
    const rendersAfterMount = renderPage.mock.calls.length;
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 312 });
    fireEvent.pointerDown(pager, {
      pointerId: 8,
      pointerType: "touch",
      clientX: 300,
      clientY: 500
    });
    fireEvent.pointerMove(pager, {
      pointerId: 8,
      pointerType: "touch",
      clientX: 240,
      clientY: 504
    });
    act(() => vi.advanceTimersByTime(20));
    const rendersAfterAxisLock = renderPage.mock.calls.length;
    fireEvent.pointerMove(pager, {
      pointerId: 8,
      pointerType: "touch",
      clientX: 180,
      clientY: 508
    });
    act(() => vi.advanceTimersByTime(20));

    expect(setMotion).toHaveBeenCalled();
    expect(rendersAfterAxisLock).toBeGreaterThan(rendersAfterMount);
    expect(renderPage).toHaveBeenCalledTimes(rendersAfterAxisLock);
  });

  it("springs an incomplete or cancelled drag back", () => {
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
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 400 });

    pointerSwipe(pager, { toX: 225 });
    expect(pager).toHaveClass("is-settling");
    expect(pager).toHaveStyle({ "--pager-drag-x": "0px" });
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();

    pointerSwipe(pager, { toX: 180, cancel: true, pointerId: 9 });
    expect(pager).toHaveClass("is-settling");
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks document and content surface for vertical browser scrolling and cleans up", () => {
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
    expect(document.documentElement).toHaveClass("horizontal-tab-pager-document");
    unmount();
    expect(surface).not.toHaveClass("horizontal-tab-pager-surface");
    expect(document.documentElement).not.toHaveClass("horizontal-tab-pager-document");
  });

  it("does not take gestures from an action or an editor", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={onChange}
        renderPage={(key) => (
          <>
            <button type="button">{key}</button>
            <textarea aria-label={`编辑-${key}`} />
          </>
        )}
      />
    );

    pointerSwipe(screen.getByRole("button", { name: "market" }));
    pointerSwipe(screen.getByRole("textbox", { name: "编辑-market" }), { pointerId: 8 });
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows an explicitly swipeable card and suppresses its accidental click", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onCardClick = vi.fn();
    render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={onChange}
        renderPage={(key) => (
          <button type="button" data-swipe-allow="true" onClick={onCardClick}>{key}</button>
        )}
      />
    );

    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 312 });
    const card = screen.getByRole("button", { name: "market" });
    pointerSwipe(card, { toX: 160 });
    fireEvent.click(card);
    act(() => vi.advanceTimersByTime(300));
    expect(onCardClick).not.toHaveBeenCalled();
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
    act(() => vi.advanceTimersByTime(20));
    expect(onChange).not.toHaveBeenCalled();
    expect(pager).toHaveClass("is-settling");
    expect(pager).toHaveStyle({ "--pager-drag-x": "-320px" });
    act(() => vi.advanceTimersByTime(300));
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
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("track");
  });

  it("uses viewport distance and release velocity to choose one adjacent page", () => {
    expect(pagerTargetIndex(1, 3, {
      deltaX: -80,
      deltaY: 4,
      velocityX: 0,
      viewportWidth: 400
    })).toBe(1);
    expect(pagerTargetIndex(1, 3, {
      deltaX: -90,
      deltaY: 4,
      velocityX: 0,
      viewportWidth: 400
    })).toBe(2);
    expect(pagerTargetIndex(1, 3, {
      deltaX: -30,
      deltaY: 3,
      velocityX: -800,
      viewportWidth: 400
    })).toBe(2);
    expect(pagerTargetIndex(1, 3, {
      deltaX: -30,
      deltaY: 80,
      velocityX: -900,
      viewportWidth: 400
    })).toBe(1);
  });

  it("does not lock a near-diagonal gesture to the horizontal axis", () => {
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
    pointerSwipe(pager, { toX: 280, fromY: 300, toY: 260 });
    act(() => vi.advanceTimersByTime(300));
    expect(pager).toHaveStyle({ "--pager-drag-x": "0px" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops at the first and last page", () => {
    expect(pagerTargetIndex(0, 3, {
      deltaX: 100,
      deltaY: 0,
      viewportWidth: 320
    })).toBe(0);
    expect(pagerTargetIndex(2, 3, {
      deltaX: -100,
      deltaY: 0,
      viewportWidth: 320
    })).toBe(2);
  });
});

describe("pager cache", () => {
  it("evicts the oldest unprotected key and never exceeds three entries", () => {
    expect(touchPagerCache(["today"], "market")).toEqual(["today", "market"]);
    expect(touchPagerCache(["today", "market", "track"], "stock"))
      .toEqual(["market", "track", "stock"]);
    expect(touchPagerCache(["today", "market", "track"], "stock", ["today"]))
      .toEqual(["today", "track", "stock"]);
  });
});
