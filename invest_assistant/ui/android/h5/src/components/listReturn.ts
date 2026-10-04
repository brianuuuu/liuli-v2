import { useEffect, useRef, type RefObject } from "react";

/**
 * 列表点进详情会被卸载，返回后要回到原来的位置：
 * 进详情前记下点过的条目离视口顶部的距离，返回后条目还在就摆回原位，
 * 不在了（已处理、被刷新挤出去）退回原 scrollY，下一条自然顶到原位置。
 * 条目元素用 data-return-id 标记。
 */
export type ListReturnAnchor = { itemId: number; offset: number; scrollY: number };

/** 一个列表页一个槽位，key 区分页签：只有记下锚点的那个页签能取到，取一次即清。 */
export function createReturnSlot<K>() {
  let saved: { key: K; anchor: ListReturnAnchor } | null = null;
  return {
    remember(key: K, container: HTMLElement | null, itemId: number) {
      const element = container?.querySelector<HTMLElement>(`[data-return-id="${itemId}"]`);
      saved = { key, anchor: { itemId, offset: element?.getBoundingClientRect().top ?? 0, scrollY: window.scrollY } };
    },
    take(key: K) {
      if (!saved || saved.key !== key) return null;
      const { anchor } = saved;
      saved = null;
      return anchor;
    },
    reset() {
      saved = null;
    }
  };
}

export type ReturnSlot<K> = ReturnType<typeof createReturnSlot<K>>;

/**
 * 列表数据就绪后恢复位置。取锚点放在帧回调里，
 * StrictMode 下第一次 effect 被取消时不会把锚点白白消费掉。
 */
export function useRestoreListPosition<K>(container: RefObject<HTMLElement | null>, ready: boolean, slot: ReturnSlot<K>, key: K) {
  const keyRef = useRef(key);
  keyRef.current = key;
  useEffect(() => {
    if (!ready) return;
    const frame = window.requestAnimationFrame(() => {
      const anchor = slot.take(keyRef.current);
      if (!anchor) return;
      const element = container.current?.querySelector<HTMLElement>(`[data-return-id="${anchor.itemId}"]`);
      const top = element ? window.scrollY + element.getBoundingClientRect().top - anchor.offset : anchor.scrollY;
      window.scrollTo({ top, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [container, ready, slot]);
}
