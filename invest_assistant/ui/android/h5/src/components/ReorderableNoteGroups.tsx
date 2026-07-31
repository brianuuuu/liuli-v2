import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NoteGroup } from "../types/api";

const HOLD_DELAY_MS = 350;
const MOVE_TOLERANCE_PX = 8;
const EDGE_ZONE_PX = 36;
const EDGE_SCROLL_PX = 6;

type Props = {
  groups: NoteGroup[];
  disabled: boolean;
  onReorder: (orderedIds: number[]) => Promise<void>;
  onArchive: (group: NoteGroup) => Promise<void>;
};

type DragGesture = {
  pointerId: number;
  groupId: number;
  target: HTMLDivElement;
  startX: number;
  startY: number;
  active: boolean;
  changed: boolean;
};

export function ReorderableNoteGroups({ groups, disabled, onReorder, onArchive }: Props) {
  const [orderedGroups, setOrderedGroups] = useState(groups);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(groups);
  const gestureRef = useRef<DragGesture | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pointerYRef = useRef(0);

  useEffect(() => {
    if (draggingId !== null) return;
    orderRef.current = groups;
    setOrderedGroups(groups);
  }, [draggingId, groups]);

  useEffect(() => () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const clearHoldTimer = () => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const stopAutoScroll = () => {
    if (scrollFrameRef.current === null) return;
    window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
  };

  const runAutoScroll = () => {
    if (scrollFrameRef.current !== null || !gestureRef.current?.active) return;
    const step = () => {
      const list = listRef.current;
      const gesture = gestureRef.current;
      if (!list || !gesture?.active) {
        scrollFrameRef.current = null;
        return;
      }
      const rect = list.getBoundingClientRect();
      const y = pointerYRef.current;
      const delta = y < rect.top + EDGE_ZONE_PX
        ? -EDGE_SCROLL_PX
        : y > rect.bottom - EDGE_ZONE_PX
          ? EDGE_SCROLL_PX
          : 0;
      if (delta) list.scrollTop += delta;
      scrollFrameRef.current = window.requestAnimationFrame(step);
    };
    scrollFrameRef.current = window.requestAnimationFrame(step);
  };

  const beginPress = (event: ReactPointerEvent<HTMLDivElement>, groupId: number) => {
    if (disabled || event.isPrimary === false || event.target instanceof Element && event.target.closest("button")) return;
    clearHoldTimer();
    gestureRef.current = {
      pointerId: event.pointerId,
      groupId,
      target: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      changed: false
    };
    holdTimerRef.current = window.setTimeout(() => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.active = true;
      setDraggingId(groupId);
      gesture.target.setPointerCapture?.(event.pointerId);
      holdTimerRef.current = null;
    }, HOLD_DELAY_MS);
  };

  const movePress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pointerYRef.current = event.clientY;
    if (!gesture.active) {
      if (
        Math.abs(event.clientX - gesture.startX) > MOVE_TOLERANCE_PX
        || Math.abs(event.clientY - gesture.startY) > MOVE_TOLERANCE_PX
      ) {
        clearHoldTimer();
        gestureRef.current = null;
      }
      return;
    }

    event.preventDefault();
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-note-group-row]") ?? [])];
    const currentIndex = orderRef.current.findIndex((group) => group.id === gesture.groupId);
    let targetIndex = currentIndex;
    if (event.clientY >= gesture.startY) {
      for (let index = currentIndex + 1; index < rows.length; index += 1) {
        const rect = rows[index].getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) targetIndex = index;
      }
    } else {
      for (let index = currentIndex - 1; index >= 0; index -= 1) {
        const rect = rows[index].getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) targetIndex = index;
      }
    }
    if (targetIndex !== currentIndex) {
      const next = [...orderRef.current];
      const [dragged] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, dragged);
      gesture.changed = true;
      orderRef.current = next;
      setOrderedGroups(next);
    }
    runAutoScroll();
  };

  const finishPress = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearHoldTimer();
    stopAutoScroll();
    gestureRef.current = null;
    setDraggingId(null);
    if (gesture.active && gesture.changed && !cancelled) {
      void onReorder(orderRef.current.map((group) => group.id)).catch(() => undefined);
    }
  };

  return (
    <div className="group-manager__list" ref={listRef} data-swipe-ignore="true">
      {orderedGroups.map((group) => (
        <div
          className={`group-row group-row--reorderable${draggingId === group.id ? " group-row--dragging" : ""}`}
          data-note-group-row="true"
          data-swipe-ignore="true"
          data-testid={`note-group-${group.id}`}
          key={group.id}
          onPointerDown={(event) => beginPress(event, group.id)}
          onPointerMove={movePress}
          onPointerUp={finishPress}
          onPointerCancel={(event) => finishPress(event, true)}
        >
          <GripVertical className="group-row__grip" aria-hidden="true" size={17} />
          <span>{group.name}</span>
          <button type="button" disabled={disabled} aria-label={`移除${group.name}`} onClick={() => void onArchive(group)}>移除</button>
        </div>
      ))}
    </div>
  );
}
