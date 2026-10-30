import React, { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computedTranslateX,
  HorizontalTabPager,
  type HorizontalTabPagerHandle,
  pagerSettleDuration,
  pagerTargetIndex
} from "../src/components/HorizontalTabPager";
import { touchPagerCache } from "../src/components/pagerCache";

const items = [
  { key: "today", label: "今日" },
  { key: "market", label: "市场" },
  { key: "track", label: "赛道" }
] as const;

/** 位移直接写在当前页的 transform 上，不再挂父级 CSS 变量。 */
function currentPageTransform() {
  return document.querySelector<HTMLElement>(".horizontal-tab-pager__page--current")?.style.transform;
}

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
    expect(currentPageTransform()).toBe("translate3d(-120px, 0, 0)");
    expect(pager.style.getPropertyValue("--pager-drag-x")).toBe("");
    fireEvent.pointerUp(pager, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 180,
      clientY: 108
    });
    act(() => vi.advanceTimersByTime(20));

    expect(onChange).not.toHaveBeenCalled();
    expect(currentPageTransform()).toBe("translate3d(-312px, 0, 0)");
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
    expect(currentPageTransform()).toBe("translate3d(0px, 0, 0)");
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

  it("does not take gestures from an editor or an explicitly ignored action", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={onChange}
        renderPage={(key) => (
          <>
            <button type="button" data-swipe-ignore="true">{key}</button>
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

  it("swipes from a tappable card and suppresses its accidental click", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onCardClick = vi.fn();
    render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={onChange}
        renderPage={(key) => (
          <button type="button" onClick={onCardClick}>{key}</button>
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

  it("keeps a plain tap on a tappable card working", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onCardClick = vi.fn();
    render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={onChange}
        renderPage={(key) => (
          <button type="button" onClick={onCardClick}>{key}</button>
        )}
      />
    );

    const card = screen.getByRole("button", { name: "market" });
    // 位移不到 8px 的轴锁阈值：这是点，不是滑
    pointerSwipe(card, { fromX: 300, toX: 297, fromY: 500, toY: 502 });
    fireEvent.click(card);
    act(() => vi.advanceTimersByTime(300));
    expect(onCardClick).toHaveBeenCalledTimes(1);
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
    act(() => vi.advanceTimersByTime(20));
    expect(onChange).not.toHaveBeenCalled();
    expect(pager).toHaveClass("is-settling");
    expect(currentPageTransform()).toBe("translate3d(-320px, 0, 0)");
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

  it("catches a settling page under the finger so a quick second swipe still counts", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    function PagerHarness() {
      const [activeKey, setActiveKey] = React.useState<(typeof items)[number]["key"]>("today");
      return (
        <HorizontalTabPager
          items={items}
          activeKey={activeKey}
          onChange={(key) => { onChange(key); setActiveKey(key); }}
          renderPage={(key) => <div>{key}</div>}
        />
      );
    }
    render(<PagerHarness />);
    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 320 });

    pointerSwipe(pager, { fromX: 300, toX: 180 });
    act(() => vi.advanceTimersByTime(20));
    expect(pager).toHaveClass("is-settling");

    // 归位动画已经走过半屏：按下就把「市场」提交为当前页，剩下的 120px 留在手指下
    vi.spyOn(window, "getComputedStyle").mockReturnValueOnce({
      transform: "matrix(1, 0, 0, 1, -200, 0)"
    } as CSSStyleDeclaration);
    fireEvent.pointerDown(pager, { pointerId: 8, pointerType: "touch", isPrimary: true, clientX: 300, clientY: 500 });
    expect(onChange).toHaveBeenLastCalledWith("market");
    expect(pager).not.toHaveClass("is-settling");
    expect(currentPageTransform()).toBe("translate3d(120px, 0, 0)");

    act(() => vi.advanceTimersByTime(120));
    fireEvent.pointerMove(pager, { pointerId: 8, pointerType: "touch", isPrimary: true, clientX: 100, clientY: 504 });
    act(() => vi.advanceTimersByTime(20));
    expect(currentPageTransform()).toBe("translate3d(-80px, 0, 0)");
    fireEvent.pointerUp(pager, { pointerId: 8, pointerType: "touch", isPrimary: true, clientX: 100, clientY: 504 });
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenLastCalledWith("track");
  });

  it("springs a caught page back to the nearer side and swallows the tap", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onClick = vi.fn();
    render(
      <HorizontalTabPager
        items={items}
        activeKey="today"
        onChange={onChange}
        renderPage={(key) => <button type="button" onClick={onClick}>{key}</button>}
      />
    );
    const pager = screen.getByTestId("horizontal-tab-pager");
    Object.defineProperty(pager, "clientWidth", { configurable: true, value: 320 });

    pointerSwipe(pager, { fromX: 300, toX: 180 });
    act(() => vi.advanceTimersByTime(20));
    const card = screen.getByRole("button", { name: "today" });
    vi.spyOn(window, "getComputedStyle").mockReturnValueOnce({
      transform: "matrix(1, 0, 0, 1, -100, 0)"
    } as CSSStyleDeclaration);
    fireEvent.pointerDown(card, { pointerId: 9, pointerType: "touch", isPrimary: true, clientX: 160, clientY: 500 });
    expect(currentPageTransform()).toBe("translate3d(-100px, 0, 0)");
    fireEvent.pointerUp(card, { pointerId: 9, pointerType: "touch", isPrimary: true, clientX: 160, clientY: 500 });
    fireEvent.click(card);
    expect(onClick).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(currentPageTransform()).toBe("translate3d(0px, 0, 0)");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reads the horizontal offset out of a computed transform matrix", () => {
    expect(computedTranslateX("matrix(1, 0, 0, 1, -187.5, 0)")).toBe(-187.5);
    expect(computedTranslateX("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 42, 7, 0, 1)")).toBe(42);
    expect(computedTranslateX("none")).toBeNull();
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
    expect(currentPageTransform()).toBe("translate3d(0px, 0, 0)");
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

describe("horizontal tab pager motion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.scrollY = 0;
  });

  it("matches the settle animation to the release velocity and falls back to distance", () => {
    // 甩得越快归位越短，但夹在 180–420ms 之间
    expect(pagerSettleDuration(100, 400, 2000)).toBe(Math.round(100 / 0.23 / 2000 * 1000));
    expect(pagerSettleDuration(300, 400, 600)).toBe(420);
    expect(pagerSettleDuration(20, 400, 5000)).toBe(180);
    // 慢松手、点页签、反向速度：按剩余距离占屏宽比例取 200–280ms
    expect(pagerSettleDuration(400, 400, 0)).toBe(280);
    expect(pagerSettleDuration(0, 400, -2000)).toBe(200);
  });

  it("parks a neighbour page at its own remembered scroll position and restores it in the same commit", () => {
    vi.useFakeTimers();
    const ref = createRef<HorizontalTabPagerHandle<(typeof items)[number]["key"]>>();
    const changes: string[] = [];
    function Harness() {
      const [activeKey, setActiveKey] = React.useState<(typeof items)[number]["key"]>("today");
      return (
        <HorizontalTabPager
          ref={ref}
          items={items}
          activeKey={activeKey}
          onChange={(key) => { changes.push(key); setActiveKey(key); }}
          renderPage={(key) => <div>{key}</div>}
        />
      );
    }
    const { container } = render(<Harness />);
    const page = (key: string) => [...container.querySelectorAll<HTMLElement>(".horizontal-tab-pager__page")]
      .find((element) => element.textContent === key);

    // 在「今日」滚到 600 后切到「市场」，「市场」从顶部开始
    window.scrollY = 600;
    act(() => ref.current?.requestChange("market"));
    act(() => vi.advanceTimersByTime(400));
    expect(changes).toEqual(["market"]);
    expect(document.documentElement.scrollTop).toBe(0);
    // 切换完成的同一次提交里位移已清零、过渡已撤掉，不会闪回旧页
    expect(page("market")?.style.transform).toBe("translate3d(0px, 0, 0)");
    expect(page("market")?.style.transition).toBe("none");

    // 「市场」滚到 100 时，左边的「今日」按它自己的 600 错位：100 − 600 = −500
    window.scrollY = 100;
    act(() => ref.current?.requestChange("today"));
    expect(page("today")?.style.transform).toBe("translate3d(calc(-100% + 0px), -500px, 0)");
    act(() => vi.advanceTimersByTime(400));
    expect(changes).toEqual(["market", "today"]);
    expect(document.documentElement.scrollTop).toBe(600);
  });

  it("pre-mounts both neighbours once the pager is idle", () => {
    vi.useFakeTimers();
    const { container } = render(
      <HorizontalTabPager
        items={items}
        activeKey="market"
        onChange={vi.fn()}
        renderPage={(key) => <div>{key}</div>}
      />
    );
    expect(container.querySelectorAll(".horizontal-tab-pager__page")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(300));
    const pages = [...container.querySelectorAll<HTMLElement>(".horizontal-tab-pager__page")];
    expect(pages.map((page) => [page.textContent, page.dataset.pagerOffset])).toEqual(
      expect.arrayContaining([["today", "-1"], ["market", "0"], ["track", "1"]])
    );
  });
});

describe("horizontal tab pager slots", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function slotOffsets(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>(".horizontal-tab-pager__page")].map((page) => ({
      key: page.textContent,
      offset: page.dataset.pagerOffset ?? ""
    }));
  }

  function SlotHarness({ startKey, innerRef }: {
    startKey: (typeof items)[number]["key"];
    innerRef: React.RefObject<HorizontalTabPagerHandle<(typeof items)[number]["key"]> | null>;
  }) {
    const [activeKey, setActiveKey] = React.useState(startKey);
    return (
      <HorizontalTabPager
        ref={innerRef}
        items={items}
        activeKey={activeKey}
        onChange={setActiveKey}
        renderPage={(key) => <div>{key}</div>}
      />
    );
  }

  it("never parks two pages in the same slot while switching between three tabs", () => {
    vi.useFakeTimers();
    const ref = createRef<HorizontalTabPagerHandle<(typeof items)[number]["key"]>>();
    const { container } = render(<SlotHarness startKey="today" innerRef={ref} />);

    // 逐个走到第三页，让三页都挂载
    for (const key of ["market", "track"] as const) {
      act(() => ref.current?.requestChange(key));
      act(() => vi.advanceTimersByTime(300));
    }
    expect(container.querySelectorAll(".horizontal-tab-pager__page")).toHaveLength(3);

    // 第三页切回第二页：动画途中第一页不能和第二页落到同一格
    act(() => ref.current?.requestChange("market"));
    act(() => vi.advanceTimersByTime(20));
    const slots = slotOffsets(container);
    const offsets = slots.map((slot) => slot.offset);
    expect(new Set(offsets).size).toBe(offsets.length);
    expect(slots.find((slot) => slot.key === "market")?.offset).toBe("-1");
    expect(slots.find((slot) => slot.key === "today")?.offset).toBe("-2");
    expect(slots.find((slot) => slot.key === "track")?.offset).toBe("0");
  });

  it("slides a skipped-over target in from the adjacent slot and parks the page it jumps past", () => {
    vi.useFakeTimers();
    const ref = createRef<HorizontalTabPagerHandle<(typeof items)[number]["key"]>>();
    const { container } = render(<SlotHarness startKey="today" innerRef={ref} />);

    act(() => ref.current?.requestChange("market"));
    act(() => vi.advanceTimersByTime(300));
    act(() => ref.current?.requestChange("today"));
    act(() => vi.advanceTimersByTime(300));

    // 从第一页直接跳到第三页，跳过的第二页必须让开
    act(() => ref.current?.requestChange("track"));
    act(() => vi.advanceTimersByTime(20));
    const slots = slotOffsets(container);
    expect(slots.find((slot) => slot.key === "today")?.offset).toBe("0");
    expect(slots.find((slot) => slot.key === "track")?.offset).toBe("1");
    expect(slots.find((slot) => slot.key === "market")?.offset).toBe("2");
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
