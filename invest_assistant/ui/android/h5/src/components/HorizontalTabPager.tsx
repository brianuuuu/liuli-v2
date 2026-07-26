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
  type RefObject
} from "react";
import { resolvePagerTarget, type PagerRelease } from "./pagerGesture";
import { touchPagerCache } from "./pagerCache";
import type { PagerMotion, PagerMotionSink } from "./pagerMotion";

type TabItem<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  items: readonly TabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  motionSink?: RefObject<PagerMotionSink | null>;
  renderPage: (key: T) => ReactNode;
};

type PagerStyle = CSSProperties & {
  "--pager-settle-duration": string;
};

type GestureSample = {
  x: number;
  time: number;
};

type PointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "pending" | "horizontal" | "vertical";
  samples: GestureSample[];
};

export type HorizontalTabPagerHandle<T extends string> = {
  requestChange: (key: T) => void;
};

const AXIS_DOMINANCE_RATIO = 1.25;
const AXIS_LOCK_DISTANCE = 8;
const EDGE_RESISTANCE = 0.18;
const MIN_SETTLE_DURATION_MS = 140;
const MAX_SETTLE_DURATION_MS = 240;
const CLICK_SUPPRESSION_MS = 500;
const VELOCITY_WINDOW_MS = 100;
const MIN_VELOCITY_SAMPLE_MS = 8;

function shouldIgnoreSwipeTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  if (element.closest("input, textarea, select, [data-swipe-ignore='true']")) return true;
  const action = element.closest("button, a");
  if (action && !action.matches("[data-swipe-allow='true']")) return true;
  const horizontalScroller = element.closest<HTMLElement>("[data-horizontal-scroll='true']");
  return Boolean(horizontalScroller && horizontalScroller.scrollWidth > horizontalScroller.clientWidth);
}

export function pagerTargetIndex(
  currentIndex: number,
  itemCount: number,
  release: Partial<Pick<PagerRelease, "velocityX" | "viewportWidth">>
    & Pick<PagerRelease, "deltaX" | "deltaY">
) {
  return resolvePagerTarget(currentIndex, itemCount, {
    ...release,
    velocityX: release.velocityX ?? 0,
    viewportWidth: release.viewportWidth ?? 320
  });
}

function HorizontalTabPagerInner<T extends string>(
  {
    items,
    activeKey,
    onChange,
    motionSink,
    renderPage
  }: Props<T>,
  forwardedRef: ForwardedRef<HorizontalTabPagerHandle<T>>
) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));
  const [settleDuration, setSettleDuration] = useState(MAX_SETTLE_DURATION_MS);
  const [settling, setSettling] = useState(false);
  const [transitionTargetIndex, setTransitionTargetIndex] = useState<number | null>(null);
  const [mountedKeys, setMountedKeys] = useState<T[]>([activeKey]);
  const pagerRef = useRef<HTMLDivElement>(null);
  const dragXRef = useRef(0);
  const gestureRef = useRef<PointerGesture | null>(null);
  const transitionLocked = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingDrag = useRef<number | null>(null);
  const suppressClickUntil = useRef(0);
  const scrollPositions = useRef(new Map<T, number>());

  const visiblePages = useMemo(() => {
    return mountedKeys
      .map((key) => ({ index: items.findIndex((item) => item.key === key), key }))
      .filter(({ index }) => index >= 0);
  }, [items, mountedKeys]);

  useEffect(() => {
    setMountedKeys((keys) => touchPagerCache(keys, activeKey, [activeKey]));
  }, [activeKey]);

  const publishMotion = useCallback((motion: PagerMotion | null) => {
    motionSink?.current?.setMotion(motion);
  }, [motionSink]);

  const writeDrag = useCallback((nextDragX: number, explicitTargetIndex?: number) => {
    dragXRef.current = nextDragX;
    pagerRef.current?.style.setProperty("--pager-drag-x", `${nextDragX}px`);
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    const inferredTarget = nextDragX < 0
      ? activeIndex + 1
      : nextDragX > 0
        ? activeIndex - 1
        : activeIndex;
    const targetIndex = explicitTargetIndex ?? inferredTarget;
    if (targetIndex < 0 || targetIndex >= items.length || targetIndex === activeIndex) {
      publishMotion(null);
      return;
    }
    publishMotion({
      fromIndex: activeIndex,
      toIndex: targetIndex,
      progress: Math.min(1, Math.abs(nextDragX) / width)
    });
  }, [activeIndex, items.length, publishMotion]);

  const flushPendingDrag = useCallback(() => {
    if (dragFrame.current !== null) {
      window.cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }
    if (pendingDrag.current === null) return;
    const nextDrag = pendingDrag.current;
    pendingDrag.current = null;
    writeDrag(nextDrag);
  }, [writeDrag]);

  const queueDrag = useCallback((nextDragX: number) => {
    pendingDrag.current = nextDragX;
    if (dragFrame.current !== null) return;
    dragFrame.current = window.requestAnimationFrame(() => {
      dragFrame.current = null;
      if (pendingDrag.current === null) return;
      const nextDrag = pendingDrag.current;
      pendingDrag.current = null;
      writeDrag(nextDrag);
    });
  }, [writeDrag]);

  const durationForDistance = useCallback((distance: number) => {
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    const fraction = Math.min(1, Math.max(0, distance / Math.max(1, width)));
    return Math.round(
      MIN_SETTLE_DURATION_MS
      + (MAX_SETTLE_DURATION_MS - MIN_SETTLE_DURATION_MS) * fraction
    );
  }, []);

  const finishSettle = useCallback((targetIndex: number | null) => {
    if (targetIndex !== null) {
      const targetKey = items[targetIndex].key;
      setMountedKeys((keys) => touchPagerCache(keys, targetKey, [targetKey]));
      onChange(targetKey);
      window.requestAnimationFrame(() => {
        const scrollTop = scrollPositions.current.get(targetKey) ?? 0;
        document.documentElement.scrollTop = scrollTop;
        document.body.scrollTop = scrollTop;
      });
    }
    dragXRef.current = 0;
    pagerRef.current?.style.setProperty("--pager-drag-x", "0px");
    pagerRef.current?.classList.remove("is-dragging");
    setSettling(false);
    setTransitionTargetIndex(null);
    transitionLocked.current = false;
    publishMotion(null);
  }, [items, onChange, publishMotion]);

  const springBack = useCallback(() => {
    flushPendingDrag();
    if (transitionLocked.current || dragXRef.current === 0) {
      publishMotion(null);
      return;
    }
    transitionLocked.current = true;
    pagerRef.current?.classList.remove("is-dragging");
    const duration = durationForDistance(Math.abs(dragXRef.current));
    setSettleDuration(duration);
    setSettling(true);
    writeDrag(0);
    settleTimer.current = window.setTimeout(() => finishSettle(null), duration);
  }, [durationForDistance, finishSettle, flushPendingDrag, publishMotion, writeDrag]);

  const settleToIndex = useCallback((targetIndex: number) => {
    if (
      transitionLocked.current
      || targetIndex === activeIndex
      || targetIndex < 0
      || targetIndex >= items.length
    ) {
      return;
    }
    transitionLocked.current = true;
    flushPendingDrag();
    pagerRef.current?.classList.remove("is-dragging");
    scrollPositions.current.set(activeKey, window.scrollY);
    const targetKey = items[targetIndex].key;
    setMountedKeys((keys) => touchPagerCache(keys, targetKey, [activeKey, targetKey]));
    const startSettle = () => {
      const width = pagerRef.current?.clientWidth || window.innerWidth;
      const targetDragX = targetIndex > activeIndex ? -width : width;
      const duration = durationForDistance(Math.abs(targetDragX - dragXRef.current));
      setSettleDuration(duration);
      setSettling(true);
      writeDrag(targetDragX, targetIndex);
      settleTimer.current = window.setTimeout(() => finishSettle(targetIndex), duration);
    };
    if (Math.abs(targetIndex - activeIndex) > 1) {
      setTransitionTargetIndex(targetIndex);
    }
    window.requestAnimationFrame(startSettle);
  }, [
    activeIndex,
    activeKey,
    durationForDistance,
    finishSettle,
    flushPendingDrag,
    items,
    writeDrag
  ]);

  useImperativeHandle(forwardedRef, () => ({
    requestChange: (key: T) => settleToIndex(items.findIndex((item) => item.key === key))
  }), [items, settleToIndex]);

  useEffect(() => {
    const pager = pagerRef.current;
    const surface = pager?.parentElement;
    if (!pager || !surface) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        transitionLocked.current
        || gestureRef.current
        || event.isPrimary === false
        || shouldIgnoreSwipeTarget(event.target)
      ) {
        return;
      }
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        axis: "pending",
        samples: [{ x: event.clientX, time: event.timeStamp }]
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || transitionLocked.current) return;
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (
        gesture.axis === "pending"
        && (Math.abs(deltaX) > AXIS_LOCK_DISTANCE || Math.abs(deltaY) > AXIS_LOCK_DISTANCE)
      ) {
        if (Math.abs(deltaX) > Math.abs(deltaY) * AXIS_DOMINANCE_RATIO) {
          gesture.axis = "horizontal";
          pager.classList.add("is-dragging");
          const targetIndex = deltaX < 0 ? activeIndex + 1 : activeIndex - 1;
          if (targetIndex >= 0 && targetIndex < items.length) {
            const targetKey = items[targetIndex].key;
            setMountedKeys((keys) => touchPagerCache(
              keys,
              targetKey,
              [activeKey, targetKey]
            ));
          }
        } else if (Math.abs(deltaY) > Math.abs(deltaX) * AXIS_DOMINANCE_RATIO) {
          gesture.axis = "vertical";
        }
      }
      if (gesture.axis !== "horizontal") return;
      event.preventDefault();
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESSION_MS;
      gesture.samples.push({ x: event.clientX, time: event.timeStamp });
      const sampleCutoff = event.timeStamp - VELOCITY_WINDOW_MS;
      gesture.samples = gesture.samples.filter((sample) => sample.time >= sampleCutoff);
      const atFirst = activeIndex === 0 && deltaX > 0;
      const atLast = activeIndex === items.length - 1 && deltaX < 0;
      queueDrag(atFirst || atLast ? deltaX * EDGE_RESISTANCE : deltaX);
    };

    const endGesture = (event: PointerEvent, cancelled: boolean) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      flushPendingDrag();
      if (cancelled || gesture.axis !== "horizontal") {
        if (gesture.axis === "horizontal") springBack();
        return;
      }
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const finalSample = { x: event.clientX, time: event.timeStamp };
      const samples = [...gesture.samples, finalSample];
      const oldest = samples.find(
        (sample) => finalSample.time - sample.time <= VELOCITY_WINDOW_MS
      ) ?? finalSample;
      const elapsed = finalSample.time - oldest.time;
      const velocityX = elapsed >= MIN_VELOCITY_SAMPLE_MS
        ? (finalSample.x - oldest.x) / elapsed * 1000
        : 0;
      const targetIndex = resolvePagerTarget(activeIndex, items.length, {
        deltaX,
        deltaY,
        velocityX,
        viewportWidth: pager.clientWidth || window.innerWidth
      });
      if (targetIndex === activeIndex) {
        springBack();
      } else {
        settleToIndex(targetIndex);
      }
    };

    const onPointerUp = (event: PointerEvent) => endGesture(event, false);
    const onPointerCancel = (event: PointerEvent) => endGesture(event, true);

    pager.style.setProperty("--pager-drag-x", "0px");
    document.documentElement.classList.add("horizontal-tab-pager-document");
    surface.classList.add("horizontal-tab-pager-surface");
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, { passive: false, capture: true });
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      document.documentElement.classList.remove("horizontal-tab-pager-document");
      surface.classList.remove("horizontal-tab-pager-surface");
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [
    activeKey,
    activeIndex,
    flushPendingDrag,
    items,
    queueDrag,
    settleToIndex,
    springBack
  ]);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (dragFrame.current !== null) window.cancelAnimationFrame(dragFrame.current);
  }, []);

  return (
    <div
      ref={pagerRef}
      className={`horizontal-tab-pager${settling ? " is-settling" : ""}`}
      data-testid="horizontal-tab-pager"
      onClickCapture={(event) => {
        if (Date.now() < suppressClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickUntil.current = 0;
        }
      }}
      style={{
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
