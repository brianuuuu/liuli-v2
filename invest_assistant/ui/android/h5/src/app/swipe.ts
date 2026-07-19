import { useRef, type TouchEventHandler } from "react";

type TabItem<T extends string> = { key: T };

export function tabAfterSwipe<T extends string>(
  items: readonly TabItem<T>[],
  activeKey: T,
  distance: number,
  threshold = 60
): T {
  if (Math.abs(distance) <= threshold) return activeKey;
  const current = Math.max(0, items.findIndex((item) => item.key === activeKey));
  const delta = distance < 0 ? 1 : -1;
  return items[Math.max(0, Math.min(items.length - 1, current + delta))]?.key ?? activeKey;
}

export function useSwipeTabs<T extends string>(
  items: readonly TabItem<T>[],
  activeKey: T,
  onChange: (key: T) => void
) {
  const touchStart = useRef<number | null>(null);
  const onTouchStart: TouchEventHandler<HTMLElement> = (event) => {
    touchStart.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd: TouchEventHandler<HTMLElement> = (event) => {
    if (touchStart.current === null) return;
    const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
    const next = tabAfterSwipe(items, activeKey, distance);
    touchStart.current = null;
    if (next !== activeKey) onChange(next);
  };
  return { onTouchStart, onTouchEnd };
}
