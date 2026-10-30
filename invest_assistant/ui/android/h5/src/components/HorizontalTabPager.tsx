import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type RefObject
} from "react";
import { flushSync } from "react-dom";
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

type GestureSample = {
  x: number;
  time: number;
};

type PointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "pending" | "horizontal" | "vertical";
  /** 起手时页面已有的位移（手指坐标系，未乘边缘阻尼）：从归位途中接住时不为 0。 */
  baseX: number;
  samples: GestureSample[];
};

export type HorizontalTabPagerHandle<T extends string> = {
  requestChange: (key: T) => void;
};

const AXIS_DOMINANCE_RATIO = 1.25;
const AXIS_LOCK_DISTANCE = 8;
const EDGE_RESISTANCE = 0.18;
const CLICK_SUPPRESSION_MS = 500;
const VELOCITY_WINDOW_MS = 100;
const MIN_VELOCITY_SAMPLE_MS = 8;
/** 空闲时预挂载左右相邻页，起手拖动时就不用当场渲染一整页列表。 */
const NEIGHBOR_PREFETCH_DELAY_MS = 300;

/**
 * 归位曲线取 easeOutQuint，和安卓 ViewPager 的五次方减速同一个手感：前段快、尾巴长。
 * 曲线起点斜率是 1 / 0.23，甩出去的归位按这个斜率反推时长，让动画起速正好接住手指的速度。
 */
export const PAGER_SETTLE_EASING = "cubic-bezier(.23, 1, .32, 1)";
const SETTLE_INITIAL_SLOPE = 1 / 0.23;
const MIN_FLING_VELOCITY = 300;
const MIN_FLING_SETTLE_MS = 180;
const MAX_FLING_SETTLE_MS = 420;
const MIN_SETTLE_MS = 200;
const MAX_SETTLE_MS = 280;

/**
 * 归位时长。松手速度朝着归位方向且够快时按速度接力；
 * 慢慢松手、点页签切换、反向回弹都按剩余距离占屏宽的比例取。
 */
export function pagerSettleDuration(distance: number, width: number, velocityTowardTarget = 0) {
  if (velocityTowardTarget >= MIN_FLING_VELOCITY) {
    const matched = SETTLE_INITIAL_SLOPE * distance / velocityTowardTarget * 1000;
    return Math.round(Math.min(MAX_FLING_SETTLE_MS, Math.max(MIN_FLING_SETTLE_MS, matched)));
  }
  const fraction = Math.min(1, Math.max(0, distance / Math.max(1, width)));
  return Math.round(MIN_SETTLE_MS + (MAX_SETTLE_MS - MIN_SETTLE_MS) * fraction);
}

/**
 * 起手时不猜「这是点还是滑」：8px 轴锁会判，误触的点击由 suppressClickUntil 吃掉。
 * 可点区域一律放行——列表行、卡片本身就是整屏内容，按下就弃权等于横滑没法用。
 * 只有自己要吃掉横向拖拽的元素才退出：输入控件、显式声明的区域、真正横向溢出的滚动容器。
 */
function shouldIgnoreSwipeTarget(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  if (element.closest("input, textarea, select, [contenteditable], [data-swipe-ignore='true']")) return true;
  const horizontalScroller = element.closest<HTMLElement>("[data-horizontal-scroll='true']");
  return Boolean(horizontalScroller && horizontalScroller.scrollWidth > horizontalScroller.clientWidth);
}

/**
 * 每张分页占第几格（当前页为 0，一格等于一屏宽）。
 * 标签多于两个时，同一侧可能同时挂着两张页，必须按真实格位摆开；
 * 否则它们会落到同一格互相盖住，切换途中露出另一张页的内容。
 * 跨格跳转时目标页临时借用相邻格滑入，被跳过的页让到视野外的格子。
 */
export function pageSlotOffset(
  index: number,
  activeIndex: number,
  transitionTargetIndex: number | null
) {
  if (index === activeIndex) return 0;
  if (transitionTargetIndex === null || transitionTargetIndex === activeIndex) {
    return index - activeIndex;
  }
  const direction = transitionTargetIndex > activeIndex ? 1 : -1;
  if (index === transitionTargetIndex) return direction;
  return index > activeIndex ? 2 : -2;
}

/** 页签下划线跟随位移：dragX 为负朝下一页，为正朝上一页；超出首尾或回到原位时不联动。 */
function dragMotion(
  activeIndex: number,
  itemCount: number,
  dragX: number,
  width: number,
  duration: number,
  explicitTargetIndex?: number
): PagerMotion | null {
  const inferredTarget = dragX < 0 ? activeIndex + 1 : dragX > 0 ? activeIndex - 1 : activeIndex;
  const targetIndex = explicitTargetIndex ?? inferredTarget;
  if (targetIndex < 0 || targetIndex >= itemCount || targetIndex === activeIndex) {
    return duration > 0 ? { fromIndex: activeIndex, toIndex: activeIndex, progress: 0, duration } : null;
  }
  return {
    fromIndex: activeIndex,
    toIndex: targetIndex,
    progress: Math.min(1, Math.abs(dragX) / width),
    duration
  };
}

/**
 * 从 computed transform 读出此刻的水平位移。归位动画跑到一半时它就是画面上的真实位置；
 * 浏览器给的是 matrix(a, b, c, d, tx, ty) 或 matrix3d 的 16 个数，tx 分别在第 5、第 13 位。
 */
export function computedTranslateX(transform: string) {
  const match = /^matrix(3d)?\((.+)\)$/.exec(transform.trim());
  if (!match) return null;
  const x = Number(match[2].split(",")[match[1] ? 12 : 4]);
  return Number.isFinite(x) ? x : null;
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
  const [settling, setSettling] = useState(false);
  const [transitionTargetIndex, setTransitionTargetIndex] = useState<number | null>(null);
  const [mountedKeys, setMountedKeys] = useState<T[]>([activeKey]);
  const pagerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<T, HTMLElement>());
  const dragXRef = useRef(0);
  const settleDurationRef = useRef(0);
  const gestureRef = useRef<PointerGesture | null>(null);
  const transitionLocked = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const settleFrame = useRef<number | null>(null);
  /** 正在归位去的目标页；回弹归位为 null。 */
  const settleTargetRef = useRef<number | null>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingDrag = useRef<number | null>(null);
  const pendingScrollRestore = useRef<number | null>(null);
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

  useEffect(() => {
    const neighbors = [activeIndex - 1, activeIndex + 1]
      .filter((index) => index >= 0 && index < items.length)
      .map((index) => items[index].key);
    if (!neighbors.length) return;
    const timer = window.setTimeout(() => {
      // 正在拖动或归位时不预挂载：渲染整页会和动画抢主线程，切换完成后会重新排一次。
      if (transitionLocked.current || gestureRef.current?.axis === "horizontal") return;
      setMountedKeys((keys) => neighbors.reduce(
        (next, key) => next.includes(key) ? next : touchPagerCache(next, key, [activeKey, ...neighbors]),
        keys
      ));
    }, NEIGHBOR_PREFETCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, activeKey, items]);

  const publishMotion = useCallback((motion: PagerMotion | null) => {
    motionSink?.current?.setMotion(motion);
  }, [motionSink]);

  /**
   * 位移直接写到每张页自己的 transform 上，不走父级 CSS 变量：变量会被整棵子树继承，
   * 拖动每一帧都要把三整页重算样式，长列表上必掉帧。
   * 相邻页按它自己记住的滚动位置错位摆放（纵向偏移 = 当前滚动 − 它的滚动），
   * 拖动途中露出来的就是离开时的样子，松手后不用再跳一次滚动位置。
   */
  const applyPages = useCallback((dragX: number, duration: number) => {
    const scrollY = window.scrollY;
    const transition = duration > 0 ? `transform ${duration}ms ${PAGER_SETTLE_EASING}` : "none";
    for (const [key, page] of pageRefs.current) {
      const offset = Number(page.dataset.pagerOffset ?? 0);
      const shiftY = offset === 0 ? 0 : scrollY - (scrollPositions.current.get(key) ?? 0);
      if (page.style.transition !== transition) page.style.transition = transition;
      page.style.transform = offset === 0
        ? `translate3d(${dragX}px, 0, 0)`
        : `translate3d(calc(${offset * 100}% + ${dragX}px), ${shiftY}px, 0)`;
    }
  }, []);

  // 每次提交后按最新格位重摆：先恢复新当前页的滚动，再算相邻页的错位。
  // 归位途中重渲染时 transform 与 transition 都和正在跑的动画一致，不会打断它。
  useLayoutEffect(() => {
    if (pendingScrollRestore.current !== null) {
      const top = pendingScrollRestore.current;
      pendingScrollRestore.current = null;
      document.documentElement.scrollTop = top;
      document.body.scrollTop = top;
    }
    applyPages(dragXRef.current, settleDurationRef.current);
  });

  // 手势现在会从可点区域起手，滑起来就得让按下态失效，否则横滑一路闪蓝。
  const setDragging = useCallback((dragging: boolean) => {
    pagerRef.current?.classList.toggle("is-dragging", dragging);
    document.documentElement.classList.toggle("pager-dragging", dragging);
  }, []);

  const writeDrag = useCallback((nextDragX: number, explicitTargetIndex?: number, duration = 0) => {
    dragXRef.current = nextDragX;
    settleDurationRef.current = duration;
    applyPages(nextDragX, duration);
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    publishMotion(dragMotion(activeIndex, items.length, nextDragX, width, duration, explicitTargetIndex));
  }, [activeIndex, applyPages, items.length, publishMotion]);

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

  /**
   * 归位结束：切换当前页、恢复它的滚动、清掉位移必须落在同一帧。
   * 分开提交时中间会有一帧旧页的格位配着清零的位移，画面闪回旧页。
   * 归位途中被手指接住时位移不清零，留下的 residualX 同样在这一帧写上。
   */
  const finishSettle = useCallback((targetIndex: number | null, residualX = 0) => {
    dragXRef.current = residualX;
    settleDurationRef.current = 0;
    settleTargetRef.current = null;
    if (targetIndex !== null) {
      const targetKey = items[targetIndex].key;
      pendingScrollRestore.current = scrollPositions.current.get(targetKey) ?? 0;
      flushSync(() => {
        setMountedKeys((keys) => touchPagerCache(keys, targetKey, [targetKey]));
        onChange(targetKey);
        setSettling(false);
        setTransitionTargetIndex(null);
      });
    } else {
      applyPages(residualX, 0);
      setSettling(false);
      setTransitionTargetIndex(null);
    }
    setDragging(false);
    transitionLocked.current = false;
    publishMotion(null);
  }, [applyPages, items, onChange, publishMotion, setDragging]);

  const springBack = useCallback((velocityX = 0) => {
    flushPendingDrag();
    if (transitionLocked.current || dragXRef.current === 0) {
      publishMotion(null);
      return;
    }
    transitionLocked.current = true;
    settleTargetRef.current = null;
    setDragging(false);
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    // 回弹朝 0 走：拖向左（负）时，向右（正）的速度才算顺着回弹方向
    const towardRest = dragXRef.current < 0 ? velocityX : -velocityX;
    const duration = pagerSettleDuration(Math.abs(dragXRef.current), width, towardRest);
    setSettling(true);
    writeDrag(0, undefined, duration);
    settleTimer.current = window.setTimeout(() => finishSettle(null), duration);
  }, [finishSettle, flushPendingDrag, publishMotion, setDragging, writeDrag]);

  const settleToIndex = useCallback((targetIndex: number, velocityX = 0) => {
    if (
      transitionLocked.current
      || targetIndex === activeIndex
      || targetIndex < 0
      || targetIndex >= items.length
    ) {
      return;
    }
    transitionLocked.current = true;
    settleTargetRef.current = targetIndex;
    flushPendingDrag();
    setDragging(false);
    scrollPositions.current.set(activeKey, window.scrollY);
    const targetKey = items[targetIndex].key;
    setMountedKeys((keys) => touchPagerCache(keys, targetKey, [activeKey, targetKey]));
    const startSettle = () => {
      settleFrame.current = null;
      const width = pagerRef.current?.clientWidth || window.innerWidth;
      const targetDragX = targetIndex > activeIndex ? -width : width;
      const towardTarget = targetDragX < 0 ? -velocityX : velocityX;
      const duration = pagerSettleDuration(Math.abs(targetDragX - dragXRef.current), width, towardTarget);
      setSettling(true);
      writeDrag(targetDragX, targetIndex, duration);
      settleTimer.current = window.setTimeout(() => finishSettle(targetIndex), duration);
    };
    if (Math.abs(targetIndex - activeIndex) > 1) {
      setTransitionTargetIndex(targetIndex);
    }
    settleFrame.current = window.requestAnimationFrame(startSettle);
  }, [
    activeIndex,
    activeKey,
    finishSettle,
    flushPendingDrag,
    items,
    setDragging,
    writeDrag
  ]);

  /**
   * 归位途中又按下：把页面接在手指下面继续拖，不丢掉这次触摸——
   * 连续快滑时第二下失效，就是因为按下落在上一下的归位动画里被整个忽略了。
   * 动画冻结在此刻画面上的真实位移；已经过半就先把目标页提交为当前页，
   * 剩下的位移留给新手势接着拖，画面不跳。跨格跳转的目标页借的是临时格位，
   * 提交后格位会整体重排，接不住，直接落到目标页。
   * 返回新手势的起始位移（换算回手指坐标，边缘阻尼区要除回去）；0 表示已经落定，按普通手势起手。
   */
  const catchSettle = useCallback(() => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    if (settleFrame.current !== null) {
      window.cancelAnimationFrame(settleFrame.current);
      settleFrame.current = null;
    }
    const target = settleTargetRef.current;
    if (target !== null && Math.abs(target - activeIndex) > 1) {
      finishSettle(target);
      return 0;
    }
    const width = pagerRef.current?.clientWidth || window.innerWidth;
    const page = pageRefs.current.get(activeKey);
    const visualX = (page && computedTranslateX(window.getComputedStyle(page).transform)) ?? dragXRef.current;
    const direction = target === null ? 0 : target > activeIndex ? 1 : -1;
    const passedHalf = direction !== 0 && -visualX * direction > width / 2;
    const nextIndex = passedHalf && target !== null ? target : activeIndex;
    const rawResidual = passedHalf ? visualX + direction * width : visualX;
    // 不足一像素就当已经落定，这次按下照常可以是一次点击
    const residualX = Math.abs(rawResidual) < 1 ? 0 : rawResidual;
    finishSettle(passedHalf ? nextIndex : null, residualX);
    if (residualX === 0) return 0;
    // 停在两页之间，接着拖往哪边都可能露出邻页，两侧都挂上
    const keep = [nextIndex - 1, nextIndex + 1, nextIndex]
      .filter((index) => index >= 0 && index < items.length)
      .map((index) => items[index].key);
    setMountedKeys((keys) => keep.reduce((next, key) => touchPagerCache(next, key, keep), keys));
    setDragging(true);
    publishMotion(dragMotion(nextIndex, items.length, residualX, width, 0));
    const overscroll = (nextIndex === 0 && residualX > 0) || (nextIndex === items.length - 1 && residualX < 0);
    return overscroll ? residualX / EDGE_RESISTANCE : residualX;
  }, [activeIndex, activeKey, finishSettle, items, publishMotion, setDragging]);

  useImperativeHandle(forwardedRef, () => ({
    requestChange: (key: T) => settleToIndex(items.findIndex((item) => item.key === key))
  }), [items, settleToIndex]);

  useEffect(() => {
    const pager = pagerRef.current;
    const surface = pager?.parentElement;
    if (!pager || !surface) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        gestureRef.current
        || event.isPrimary === false
        || shouldIgnoreSwipeTarget(event.target)
      ) {
        return;
      }
      // 接住的页面停在两页之间，起手就是横向拖动，不再等轴锁
      const baseX = transitionLocked.current ? catchSettle() : 0;
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        axis: baseX === 0 ? "pending" : "horizontal",
        baseX,
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
          setDragging(true);
          const targetIndex = deltaX < 0 ? activeIndex + 1 : activeIndex - 1;
          if (targetIndex >= 0 && targetIndex < items.length) {
            const targetKey = items[targetIndex].key;
            setMountedKeys((keys) => keys.includes(targetKey) ? keys : touchPagerCache(
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
      const dragX = gesture.baseX + deltaX;
      const atFirst = activeIndex === 0 && dragX > 0;
      const atLast = activeIndex === items.length - 1 && dragX < 0;
      queueDrag(atFirst || atLast ? dragX * EDGE_RESISTANCE : dragX);
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
      // 接住页面后原地松手也算拖动过，下面卡片的点击不能放出去
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESSION_MS;
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
      const width = pager.clientWidth || window.innerWidth;
      let targetIndex = resolvePagerTarget(activeIndex, items.length, {
        deltaX,
        deltaY,
        velocityX,
        viewportWidth: width
      });
      // 接住的手势起手就停在两页之间：手指这一下没定出新方向时，落到离得近的那一页
      if (targetIndex === activeIndex && Math.abs(dragXRef.current) > width / 2) {
        targetIndex = Math.max(0, Math.min(items.length - 1, activeIndex + (dragXRef.current < 0 ? 1 : -1)));
      }
      if (targetIndex === activeIndex) {
        springBack(velocityX);
      } else {
        settleToIndex(targetIndex, velocityX);
      }
    };

    const onPointerUp = (event: PointerEvent) => endGesture(event, false);
    const onPointerCancel = (event: PointerEvent) => endGesture(event, true);

    document.documentElement.classList.add("horizontal-tab-pager-document");
    surface.classList.add("horizontal-tab-pager-surface");
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, { passive: false, capture: true });
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      document.documentElement.classList.remove("horizontal-tab-pager-document");
      document.documentElement.classList.remove("pager-dragging");
      surface.classList.remove("horizontal-tab-pager-surface");
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [
    activeKey,
    activeIndex,
    catchSettle,
    flushPendingDrag,
    items,
    queueDrag,
    setDragging,
    settleToIndex,
    springBack
  ]);

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    if (settleFrame.current !== null) window.cancelAnimationFrame(settleFrame.current);
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
    >
      {visiblePages.map(({ index, key }) => {
        const offset = pageSlotOffset(index, activeIndex, transitionTargetIndex);
        return (
          <section
            className={`horizontal-tab-pager__page ${
              offset === 0
                ? "horizontal-tab-pager__page--current"
                : "horizontal-tab-pager__page--off"
            }`}
            data-pager-offset={offset}
            ref={(element) => {
              if (element) pageRefs.current.set(key, element);
              else pageRefs.current.delete(key);
            }}
            aria-hidden={index !== activeIndex}
            key={key}
          >
            {renderPage(key)}
          </section>
        );
      })}
    </div>
  );
}

export const HorizontalTabPager = forwardRef(HorizontalTabPagerInner) as <T extends string>(
  props: Props<T> & { ref?: ForwardedRef<HorizontalTabPagerHandle<T>> }
) => ReactElement;
