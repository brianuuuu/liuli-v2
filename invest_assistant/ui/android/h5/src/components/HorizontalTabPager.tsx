import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type TouchEventHandler
} from "react";

type TabItem<T extends string> = { key: T; label: string };
type SwipeDistance = { deltaX: number; deltaY: number };

type Props<T extends string> = {
  items: readonly TabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  renderPage: (key: T) => ReactNode;
};

type PagerStyle = CSSProperties & { "--pager-drag-x": string };

export type HorizontalTabPagerHandle<T extends string> = {
  requestChange: (key: T) => void;
};

const SWIPE_THRESHOLD = 60;
const SETTLE_DURATION_MS = 220;

function shouldIgnoreSwipeTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  if (element.closest("input, textarea, select, [data-swipe-ignore='true']")) return true;
  const horizontalScroller = element.closest<HTMLElement>("[data-horizontal-scroll='true']");
  return Boolean(horizontalScroller && horizontalScroller.scrollWidth > horizontalScroller.clientWidth);
}

export function pagerTargetIndex(
  currentIndex: number,
  itemCount: number,
  { deltaX, deltaY }: SwipeDistance
) {
  if (
    Math.abs(deltaX) <= SWIPE_THRESHOLD ||
    Math.abs(deltaX) <= Math.abs(deltaY) * 1.2
  ) {
    return currentIndex;
  }
  const direction = deltaX < 0 ? 1 : -1;
  return Math.max(0, Math.min(itemCount - 1, currentIndex + direction));
}

function HorizontalTabPagerInner<T extends string>(
  {
    items,
    activeKey,
    onChange,
    renderPage
  }: Props<T>,
  forwardedRef: ForwardedRef<HorizontalTabPagerHandle<T>>
) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));
  const [dragX, setDragX] = useState(0);
  const [settling, setSettling] = useState(false);
  const [transitionTargetIndex, setTransitionTargetIndex] = useState<number | null>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"pending" | "horizontal" | "vertical">("pending");
  const transitionLocked = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const scrollPositions = useRef(new Map<T, number>());

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  const visiblePages = useMemo(() => {
    const indices = [activeIndex - 1, activeIndex, activeIndex + 1, transitionTargetIndex]
      .filter((index): index is number => index !== null)
      .filter((index) => index >= 0 && index < items.length);
    return [...new Set(indices)].map((index) => ({ index, key: items[index].key }));
  }, [activeIndex, items, transitionTargetIndex]);

  const settleToIndex = useCallback((targetIndex: number) => {
    if (transitionLocked.current || settling || targetIndex === activeIndex || targetIndex < 0 || targetIndex >= items.length) return;
    transitionLocked.current = true;
    scrollPositions.current.set(activeKey, window.scrollY);
    const startSettle = () => {
      const width = pagerRef.current?.clientWidth || window.innerWidth;
      setSettling(true);
      setDragX(targetIndex > activeIndex ? -width : width);
      settleTimer.current = window.setTimeout(() => {
        const targetKey = items[targetIndex].key;
        onChange(targetKey);
        window.requestAnimationFrame(() => {
          const scrollTop = scrollPositions.current.get(targetKey) ?? 0;
          document.documentElement.scrollTop = scrollTop;
          document.body.scrollTop = scrollTop;
        });
        setDragX(0);
        setSettling(false);
        setTransitionTargetIndex(null);
        transitionLocked.current = false;
      }, SETTLE_DURATION_MS);
    };
    if (Math.abs(targetIndex - activeIndex) > 1) {
      setTransitionTargetIndex(targetIndex);
      window.requestAnimationFrame(startSettle);
    } else {
      startSettle();
    }
  }, [activeIndex, activeKey, items, onChange, settling]);

  useImperativeHandle(forwardedRef, () => ({
    requestChange: (key: T) => settleToIndex(items.findIndex((item) => item.key === key))
  }), [items, settleToIndex]);

  const onTouchStart: TouchEventHandler<HTMLElement> = (event) => {
    if (transitionLocked.current || settling || shouldIgnoreSwipeTarget(event.target)) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    axis.current = "pending";
  };

  const onTouchMove: TouchEventHandler<HTMLElement> = (event) => {
    const start = touchStart.current;
    const touch = event.touches[0];
    if (!start || !touch || settling) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (axis.current === "pending" && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      axis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }
    if (axis.current !== "horizontal") return;
    event.preventDefault();
    const atFirst = activeIndex === 0 && deltaX > 0;
    const atLast = activeIndex === items.length - 1 && deltaX < 0;
    setDragX(atFirst || atLast ? deltaX * 0.2 : deltaX);
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = (event) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch || settling || axis.current !== "horizontal") {
      setDragX(0);
      return;
    }
    const distance = {
      deltaX: touch.clientX - start.x,
      deltaY: touch.clientY - start.y
    };
    const targetIndex = pagerTargetIndex(activeIndex, items.length, distance);
    if (targetIndex === activeIndex) {
      transitionLocked.current = true;
      setSettling(true);
      setDragX(0);
      settleTimer.current = window.setTimeout(() => {
        setSettling(false);
        transitionLocked.current = false;
      }, SETTLE_DURATION_MS);
      return;
    }
    settleToIndex(targetIndex);
  };

  const onTouchCancel: TouchEventHandler<HTMLElement> = () => {
    touchStart.current = null;
    axis.current = "pending";
    setDragX(0);
    setSettling(false);
    transitionLocked.current = false;
  };

  return (
    <div
      ref={pagerRef}
      className={`horizontal-tab-pager${settling ? " is-settling" : ""}`}
      data-testid="horizontal-tab-pager"
      style={{ "--pager-drag-x": `${dragX}px` } as PagerStyle}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {visiblePages.map(({ index, key }) => (
        <section
          className={`horizontal-tab-pager__page ${
            index === activeIndex
              ? "horizontal-tab-pager__page--current"
              : index < activeIndex
                ? "horizontal-tab-pager__page--previous"
                : "horizontal-tab-pager__page--next"
          }`}
          aria-hidden={index !== activeIndex}
          key={key}
        >
          {renderPage(key)}
        </section>
      ))}
    </div>
  );
}

export const HorizontalTabPager = forwardRef(HorizontalTabPagerInner) as <T extends string>(
  props: Props<T> & { ref?: ForwardedRef<HorizontalTabPagerHandle<T>> }
) => ReactElement;
