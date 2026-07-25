import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { PagerMotion } from "./HorizontalTabPager";

export type SecondaryNavigationItem<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  items: readonly SecondaryNavigationItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  motion?: PagerMotion | null;
  endAction?: {
    label: string;
    onClick: () => void;
  };
};

type IndicatorGeometry = {
  left: number;
  width: number;
  duration: number;
};

const INDICATOR_INSET_RATIO = 0.26;
const INDICATOR_WIDTH_RATIO = 0.48;

function settleDurationForProgress(progressDistance: number) {
  return Math.round(Math.max(120, Math.min(220, 220 * progressDistance)));
}

export function SecondaryNavigation<T extends string>({
  items,
  activeKey,
  onChange,
  motion = null,
  endAction
}: Props<T>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousMotion = useRef<PagerMotion | null>(null);
  const [indicator, setIndicator] = useState<IndicatorGeometry>({ left: 0, width: 0, duration: 0 });

  useLayoutEffect(() => {
    const geometryFor = (index: number) => {
      const tab = tabRefs.current[index];
      if (!tab) return null;
      return {
        left: tab.offsetLeft + tab.offsetWidth * INDICATOR_INSET_RATIO,
        width: tab.offsetWidth * INDICATOR_WIDTH_RATIO
      };
    };
    const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));
    const from = geometryFor(motion?.fromIndex ?? activeIndex);
    const to = geometryFor(motion?.toIndex ?? activeIndex);
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
    setIndicator({
      left: from.left + (to.left - from.left) * progress,
      width: from.width + (to.width - from.width) * progress,
      duration: isSettling ? settleDurationForProgress(Math.abs(progress - previousProgress)) : 0
    });
    previousMotion.current = motion;

    if (!motion) {
      tabRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  }, [activeKey, items, motion]);

  const indicatorStyle = {
    width: `${indicator.width}px`,
    transform: `translate3d(${indicator.left}px, 0, 0)`,
    transitionDuration: `${indicator.duration}ms`
  } as CSSProperties;

  return (
    <div className="secondary-navigation" data-height="36" role="tablist" aria-label="二级导航">
      <div className="secondary-navigation__track" data-horizontal-scroll="true">
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
          className="secondary-navigation__indicator"
          data-testid="secondary-navigation-indicator"
          style={indicatorStyle}
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
