import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ForwardedRef,
  type ReactElement
} from "react";
import type { PagerMotion, PagerMotionSink } from "./pagerMotion";

export type SecondaryNavigationItem<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  items: readonly SecondaryNavigationItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  endAction?: {
    label: string;
    onClick: () => void;
  };
};

type TabGeometry = {
  left: number;
  width: number;
};

const INDICATOR_INSET_RATIO = 0.26;
const INDICATOR_WIDTH_RATIO = 0.48;

function settleDurationForProgress(progressDistance: number) {
  return Math.round(Math.max(120, Math.min(220, 220 * progressDistance)));
}

function SecondaryNavigationInner<T extends string>({
  items,
  activeKey,
  onChange,
  endAction
}: Props<T>, forwardedRef: ForwardedRef<PagerMotionSink>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const geometries = useRef<Array<TabGeometry | null>>([]);
  const previousMotion = useRef<PagerMotion | null>(null);

  const applyMotion = useCallback((motion: PagerMotion | null) => {
    const indicator = indicatorRef.current;
    if (!indicator) return;
    const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));
    const from = geometries.current[motion?.fromIndex ?? activeIndex];
    const to = geometries.current[motion?.toIndex ?? activeIndex];
    if (!from || !to) return;

    const progress = motion?.progress ?? 0;
    const previous = previousMotion.current;
    const isSettling =
      Boolean(motion) &&
      (progress === 0 || progress === 1) &&
      (
        !previous ||
        previous.fromIndex !== motion?.fromIndex ||
        previous.toIndex !== motion?.toIndex ||
        previous.progress !== progress
      );
    const previousProgress =
      previous &&
      motion &&
      previous.fromIndex === motion.fromIndex &&
      previous.toIndex === motion.toIndex
        ? previous.progress
        : 0;
    const duration = motion?.duration
      ?? (isSettling ? settleDurationForProgress(Math.abs(progress - previousProgress)) : 0);
    indicator.style.width = `${from.width + (to.width - from.width) * progress}px`;
    indicator.style.transform = `translate3d(${from.left + (to.left - from.left) * progress}px, 0, 0)`;
    indicator.style.transitionDuration = `${duration}ms`;
    previousMotion.current = motion;
  }, [activeKey, items]);

  useImperativeHandle(forwardedRef, () => ({ setMotion: applyMotion }), [applyMotion]);

  useLayoutEffect(() => {
    const measure = () => {
      geometries.current = tabRefs.current.map((tab) => tab ? {
        left: tab.offsetLeft + tab.offsetWidth * INDICATOR_INSET_RATIO,
        width: tab.offsetWidth * INDICATOR_WIDTH_RATIO
      } : null);
      applyMotion(previousMotion.current);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (trackRef.current) observer?.observe(trackRef.current);
    tabRefs.current.forEach((tab) => {
      if (tab) observer?.observe(tab);
    });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [applyMotion, items]);

  useLayoutEffect(() => {
    const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));
    previousMotion.current = null;
    applyMotion(null);
    tabRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeKey, applyMotion, items]);

  return (
    <div className="secondary-navigation" data-height="36" role="tablist" aria-label="二级导航">
      <div ref={trackRef} className="secondary-navigation__track" data-horizontal-scroll="true">
        {items.map((item, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={item.key === activeKey}
            className={`secondary-navigation__item${item.key === activeKey ? " is-active" : ""}`}
            key={item.key}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            onClick={() => onChange(item.key)}
          >
            {item.label}
          </button>
        ))}
        <span
          ref={indicatorRef}
          className="secondary-navigation__indicator"
          data-testid="secondary-navigation-indicator"
          style={{ width: "0px", transform: "translate3d(0px, 0, 0)", transitionDuration: "0ms" }}
        />
      </div>
      {endAction ? (
        <button
          type="button"
          className="secondary-navigation__end-action"
          data-swipe-ignore="true"
          onClick={endAction.onClick}
        >
          {endAction.label}
        </button>
      ) : null}
    </div>
  );
}

export const SecondaryNavigation = forwardRef(SecondaryNavigationInner) as <T extends string>(
  props: Props<T> & { ref?: ForwardedRef<PagerMotionSink> }
) => ReactElement;
