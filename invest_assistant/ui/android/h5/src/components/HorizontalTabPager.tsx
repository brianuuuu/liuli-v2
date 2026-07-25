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
  type ReactNode
} from "react";

type TabItem<T extends string> = { key: T; label: string };
type SwipeDistance = { deltaX: number; deltaY: number };

type Props<T extends string> = {
  items: readonly TabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  onMotionChange?: (motion: PagerMotion | null) => void;
  renderPage: (key: T) => ReactNode;
};

type PagerStyle = CSSProperties & {
  "--pager-drag-x": string;
  "--pager-settle-duration": string;
};

export type PagerMotion = {
  fromIndex: number;
  toIndex: number;
  progress: number;
};

export type HorizontalTabPagerHandle<T extends string> = {
  requestChange: (key: T) => void;
};

const SWIPE_THRESHOLD = 60;
const AXIS_DOMINANCE_RATIO = 1.2;
const SETTLE_DURATION_MS = 220;
const MIN_SETTLE_DURATION_MS = 120;
const NATIVE_SETTLE_FALLBACK_MS = 120;

function shouldIgnoreSwipeTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  if (element.closest("button, a, input, textarea, select, [data-swipe-ignore='true']")) return true;
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
    Math.abs(deltaX) <= Math.abs(deltaY) * AXIS_DOMINANCE_RATIO
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
    onMotionChange,
    renderPage
  }: Props<T>,
  forwardedRef: ForwardedRef<HorizontalTabPagerHandle<T>>
) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));
  const [dragX, setDragX] = useState(0);
  const [settleDuration, setSettleDuration] = useState(SETTLE_DURATION_MS);
  const [settling, setSettling] = useState(false);
  const [transitionTargetIndex, setTransitionTargetIndex] = useState<number | null>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const dragXRef = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"pending" | "horizontal" | "vertical">("pending");
  const nativeGestureEligible = useRef(false);
  const transitionLocked = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const nativeFallbackTimer = useRef<number | null>(null);
  const scrollPositions = useRef(new Map<T, number>());

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (nativeFallbackTimer.current !== null) window.clearTimeout(nativeFallbackTimer.current);
  }, []);

  const visiblePages = useMemo(() => {
    const indices = [activeIndex - 1, activeIndex, activeIndex + 1, transitionTargetIndex]
      .filter((index): index is number => index !== null)
      .filter((index) => index >= 0 && index < items.length);
    return [...new Set(indices)].map((index) => ({ index, key: items[index].key }));
  }, [activeIndex, items, transitionTargetIndex]);

  const publishDrag = useCallback((nextDragX: number, explicitTargetIndex?: number) => {
    dragXRef.current = nextDragX;
    setDragX(nextDragX);
    if (!onMotionChange) return;
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    const inferredTarget = nextDragX < 0 ? activeIndex + 1 : nextDragX > 0 ? activeIndex - 1 : activeIndex;
    const targetIndex = explicitTargetIndex ?? inferredTarget;
    if (targetIndex < 0 || targetIndex >= items.length || targetIndex === activeIndex) {
      onMotionChange(nextDragX === 0 ? null : {
        fromIndex: activeIndex,
        toIndex: activeIndex,
        progress: 0
      });
      return;
    }
    onMotionChange({
      fromIndex: activeIndex,
      toIndex: targetIndex,
      progress: Math.min(1, Math.abs(nextDragX) / width)
    });
  }, [activeIndex, items.length, onMotionChange]);

  const settleDurationForDistance = useCallback((distance: number) => {
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    return Math.round(Math.max(
      MIN_SETTLE_DURATION_MS,
      Math.min(SETTLE_DURATION_MS, SETTLE_DURATION_MS * distance / width)
    ));
  }, []);

  const springBack = useCallback(() => {
    if (transitionLocked.current || settling || dragXRef.current === 0) {
      if (dragXRef.current === 0) onMotionChange?.(null);
      return;
    }
    transitionLocked.current = true;
    const previousDragX = dragXRef.current;
    const duration = settleDurationForDistance(Math.abs(previousDragX));
    setSettleDuration(duration);
    setSettling(true);
    dragXRef.current = 0;
    setDragX(0);
    const targetIndex = previousDragX < 0 ? activeIndex + 1 : activeIndex - 1;
    onMotionChange?.(
      targetIndex >= 0 && targetIndex < items.length
        ? { fromIndex: activeIndex, toIndex: targetIndex, progress: 0 }
        : null
    );
    settleTimer.current = window.setTimeout(() => {
      setSettling(false);
      transitionLocked.current = false;
      onMotionChange?.(null);
    }, duration);
  }, [activeIndex, items.length, onMotionChange, settleDurationForDistance, settling]);

  const settleToIndex = useCallback((targetIndex: number) => {
    if (transitionLocked.current || settling || targetIndex === activeIndex || targetIndex < 0 || targetIndex >= items.length) return;
    transitionLocked.current = true;
    scrollPositions.current.set(activeKey, window.scrollY);
    const startSettle = () => {
      const width = pagerRef.current?.clientWidth || window.innerWidth;
      const targetDragX = targetIndex > activeIndex ? -width : width;
      const duration = settleDurationForDistance(Math.abs(targetDragX - dragXRef.current));
      setSettleDuration(duration);
      setSettling(true);
      publishDrag(targetDragX, targetIndex);
      settleTimer.current = window.setTimeout(() => {
        const targetKey = items[targetIndex].key;
        onChange(targetKey);
        window.requestAnimationFrame(() => {
          const scrollTop = scrollPositions.current.get(targetKey) ?? 0;
          document.documentElement.scrollTop = scrollTop;
          document.body.scrollTop = scrollTop;
        });
        dragXRef.current = 0;
        setDragX(0);
        setSettling(false);
        setTransitionTargetIndex(null);
        transitionLocked.current = false;
        onMotionChange?.(null);
      }, duration);
    };
    if (Math.abs(targetIndex - activeIndex) > 1) {
      setTransitionTargetIndex(targetIndex);
      window.requestAnimationFrame(startSettle);
    } else {
      startSettle();
    }
  }, [activeIndex, activeKey, items, onChange, onMotionChange, publishDrag, settleDurationForDistance, settling]);

  useImperativeHandle(forwardedRef, () => ({
    requestChange: (key: T) => settleToIndex(items.findIndex((item) => item.key === key))
  }), [items, settleToIndex]);

  const onTouchStart = useCallback((event: TouchEvent) => {
    const pager = pagerRef.current;
    const surface = pager?.parentElement;
    const target = event.target;
    if (!pager || !surface || (target !== surface && (!(target instanceof Node) || !pager.contains(target)))) return;
    if (transitionLocked.current || settling || shouldIgnoreSwipeTarget(event.target)) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    axis.current = "pending";
  }, [settling]);

  const onTouchMove = useCallback((event: TouchEvent) => {
    const start = touchStart.current;
    const touch = event.touches[0];
    if (!start || !touch || settling) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (axis.current === "pending" && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      if (Math.abs(deltaX) > Math.abs(deltaY) * AXIS_DOMINANCE_RATIO) {
        axis.current = "horizontal";
      } else if (Math.abs(deltaY) > Math.abs(deltaX) * AXIS_DOMINANCE_RATIO) {
        axis.current = "vertical";
      }
    }
    if (axis.current !== "horizontal") return;
    event.preventDefault();
    const atFirst = activeIndex === 0 && deltaX > 0;
    const atLast = activeIndex === items.length - 1 && deltaX < 0;
    publishDrag(atFirst || atLast ? deltaX * 0.2 : deltaX);
  }, [activeIndex, items.length, publishDrag, settling]);

  const onTouchEnd = useCallback((event: TouchEvent) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch || settling || axis.current !== "horizontal") {
      dragXRef.current = 0;
      setDragX(0);
      onMotionChange?.(null);
      return;
    }
    const distance = {
      deltaX: touch.clientX - start.x,
      deltaY: touch.clientY - start.y
    };
    const targetIndex = pagerTargetIndex(activeIndex, items.length, distance);
    if (targetIndex === activeIndex) {
      springBack();
      return;
    }
    settleToIndex(targetIndex);
  }, [activeIndex, items.length, onMotionChange, settleToIndex, settling, springBack]);

  const onTouchCancel = useCallback(() => {
    touchStart.current = null;
    axis.current = "pending";
    dragXRef.current = 0;
    setDragX(0);
    setSettling(false);
    transitionLocked.current = false;
    onMotionChange?.(null);
  }, [onMotionChange]);

  const onNativeTouchStart = useCallback((event: TouchEvent) => {
    nativeGestureEligible.current = false;
    if (transitionLocked.current || settling) return;
    const pager = pagerRef.current;
    const surface = pager?.parentElement;
    const touch = event.touches[0];
    if (!pager || !surface || !touch) return;
    const rect = surface.getBoundingClientRect();
    if (
      touch.clientX < rect.left ||
      touch.clientX > rect.right ||
      touch.clientY < rect.top ||
      touch.clientY > rect.bottom
    ) return;
    const hitTarget = document.elementFromPoint?.(touch.clientX, touch.clientY) ?? event.target;
    if (shouldIgnoreSwipeTarget(hitTarget)) return;
    nativeGestureEligible.current = true;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    axis.current = "pending";
  }, [settling]);

  const onNativeTouchMove = useCallback((event: TouchEvent) => {
    const start = touchStart.current;
    const touch = event.touches[0];
    if (!start || !touch || transitionLocked.current || settling) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (axis.current === "pending" && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      if (Math.abs(deltaX) > Math.abs(deltaY) * AXIS_DOMINANCE_RATIO) {
        axis.current = "horizontal";
      } else if (Math.abs(deltaY) > Math.abs(deltaX) * AXIS_DOMINANCE_RATIO) {
        axis.current = "vertical";
      }
    }
    if (axis.current !== "horizontal") return;
    const atFirst = activeIndex === 0 && deltaX > 0;
    const atLast = activeIndex === items.length - 1 && deltaX < 0;
    publishDrag(atFirst || atLast ? deltaX * 0.2 : deltaX);
  }, [activeIndex, items.length, publishDrag, settling]);

  const onNativeTouchEnd = useCallback(() => {
    touchStart.current = null;
    axis.current = "pending";
    if (transitionLocked.current || dragXRef.current === 0) return;
    nativeFallbackTimer.current = window.setTimeout(springBack, NATIVE_SETTLE_FALLBACK_MS);
  }, [springBack]);

  useEffect(() => {
    const onNativeSwipe = (event: Event) => {
      if (nativeFallbackTimer.current !== null) {
        window.clearTimeout(nativeFallbackTimer.current);
        nativeFallbackTimer.current = null;
      }
      if (!nativeGestureEligible.current) return;
      nativeGestureEligible.current = false;
      const outcome = (event as CustomEvent<{ outcome?: string }>).detail?.outcome;
      if (outcome === "next" && activeIndex < items.length - 1) {
        settleToIndex(activeIndex + 1);
        return;
      }
      if (outcome === "previous" && activeIndex > 0) {
        settleToIndex(activeIndex - 1);
        return;
      }
      springBack();
    };
    window.addEventListener("liuli:native-swipe", onNativeSwipe);
    return () => window.removeEventListener("liuli:native-swipe", onNativeSwipe);
  }, [activeIndex, items.length, settleToIndex, springBack]);

  useEffect(() => {
    const surface = pagerRef.current?.parentElement;
    if (!surface) return;
    surface.classList.add("horizontal-tab-pager-surface");
    const nativeMode = Boolean(window.LiuliNative);
    const touchTarget: EventTarget = nativeMode ? document : surface;
    touchTarget.addEventListener("touchstart", nativeMode ? onNativeTouchStart as EventListener : onTouchStart as EventListener, nativeMode);
    touchTarget.addEventListener(
      "touchmove",
      nativeMode ? onNativeTouchMove as EventListener : onTouchMove as EventListener,
      nativeMode ? { passive: true, capture: true } : { passive: false }
    );
    touchTarget.addEventListener("touchend", nativeMode ? onNativeTouchEnd as EventListener : onTouchEnd as EventListener, nativeMode);
    touchTarget.addEventListener("touchcancel", nativeMode ? onNativeTouchEnd as EventListener : onTouchCancel as EventListener, nativeMode);
    return () => {
      surface.classList.remove("horizontal-tab-pager-surface");
      touchTarget.removeEventListener("touchstart", nativeMode ? onNativeTouchStart as EventListener : onTouchStart as EventListener, nativeMode);
      touchTarget.removeEventListener("touchmove", nativeMode ? onNativeTouchMove as EventListener : onTouchMove as EventListener, nativeMode);
      touchTarget.removeEventListener("touchend", nativeMode ? onNativeTouchEnd as EventListener : onTouchEnd as EventListener, nativeMode);
      touchTarget.removeEventListener("touchcancel", nativeMode ? onNativeTouchEnd as EventListener : onTouchCancel as EventListener, nativeMode);
    };
  }, [
    onNativeTouchEnd,
    onNativeTouchMove,
    onNativeTouchStart,
    onTouchCancel,
    onTouchEnd,
    onTouchMove,
    onTouchStart
  ]);

  return (
    <div
      ref={pagerRef}
      className={`horizontal-tab-pager${settling ? " is-settling" : ""}`}
      data-testid="horizontal-tab-pager"
      style={{
        "--pager-drag-x": `${dragX}px`,
        "--pager-settle-duration": `${settleDuration}ms`
      } as PagerStyle}
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
