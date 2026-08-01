import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NoteGroup } from "../types/api";

const EDGE_ZONE_PX = 36;
const EDGE_SCROLL_PX = 6;

type Props = {
  groups: NoteGroup[];
  disabled: boolean;
  onReorder: (orderedIds: number[]) => Promise<void>;
  onRename: (group: NoteGroup, name: string) => Promise<void>;
  onArchive: (group: NoteGroup) => Promise<void>;
};

type DragGesture = {
  pointerId: number;
  groupId: number;
  startY: number;
  changed: boolean;
};

export function ReorderableNoteGroups({ groups, disabled, onReorder, onRename, onArchive }: Props) {
  const [orderedGroups, setOrderedGroups] = useState(groups);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(groups);
  const gestureRef = useRef<DragGesture | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pointerYRef = useRef(0);

  useEffect(() => {
    if (draggingId !== null) return;
    orderRef.current = groups;
    setOrderedGroups(groups);
  }, [draggingId, groups]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const stopAutoScroll = () => {
    if (scrollFrameRef.current === null) return;
    window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
  };

  const runAutoScroll = () => {
    if (scrollFrameRef.current !== null || !gestureRef.current) return;
    const step = () => {
      const list = listRef.current;
      if (!list || !gestureRef.current) {
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

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, groupId: number) => {
    if (disabled || renamePending || event.isPrimary === false) return;
    event.preventDefault();
    gestureRef.current = {
      pointerId: event.pointerId,
      groupId,
      startY: event.clientY,
      changed: false
    };
    pointerYRef.current = event.clientY;
    setDraggingId(groupId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    pointerYRef.current = event.clientY;
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

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    stopAutoScroll();
    gestureRef.current = null;
    setDraggingId(null);
    if (gesture.changed && !cancelled) {
      void onReorder(orderRef.current.map((group) => group.id)).catch(() => undefined);
    }
  };

  const startRename = (group: NoteGroup) => {
    setEditingId(group.id);
    setDraftName(group.name);
    setRenameError(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setDraftName("");
    setRenameError(null);
  };

  const saveRename = async (group: NoteGroup) => {
    const name = draftName.trim();
    if (!name || name === group.name) {
      cancelRename();
      return;
    }
    setRenamePending(true);
    setRenameError(null);
    try {
      await onRename(group, name);
      cancelRename();
    } catch {
      setRenameError("分组名称保存失败");
    } finally {
      setRenamePending(false);
    }
  };

  return (
    <div
      className="group-manager__list"
      ref={listRef}
      data-swipe-ignore="true"
      style={{ height: `${Math.min(orderedGroups.length * 43, 308)}px` }}
    >
      {orderedGroups.map((group) => {
        const editing = editingId === group.id;
        return (
          <div
            className={`group-row group-row--reorderable${draggingId === group.id ? " group-row--dragging" : ""}${editing ? " group-row--editing" : ""}`}
            data-note-group-row="true"
            data-swipe-ignore="true"
            data-testid={`note-group-${group.id}`}
            key={group.id}
          >
            <button
              type="button"
              className="group-row__grip"
              aria-label={`调整${group.name}顺序`}
              disabled={disabled || renamePending || editing}
              onPointerDown={(event) => beginDrag(event, group.id)}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={(event) => finishDrag(event, true)}
            >
              <GripVertical aria-hidden="true" size={18} />
            </button>
            {editing ? (
              <div className="group-row__editor">
                <input
                  aria-label="分组名称"
                  autoFocus
                  disabled={renamePending}
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveRename(group);
                    if (event.key === "Escape") cancelRename();
                  }}
                />
                <button type="button" aria-label="保存分组名称" disabled={!draftName.trim() || renamePending} onClick={() => void saveRename(group)}>保存</button>
                <button type="button" aria-label="取消编辑分组" disabled={renamePending} onClick={cancelRename}>取消</button>
              </div>
            ) : (
              <>
                <span>{group.name}</span>
                <div className="group-row__actions">
                  <button type="button" disabled={disabled} aria-label={`编辑${group.name}`} onClick={() => startRename(group)}>编辑</button>
                  <button type="button" disabled={disabled} aria-label={`移除${group.name}`} onClick={() => void onArchive(group)}>移除</button>
                </div>
              </>
            )}
            {editing && renameError ? <p className="group-row__error" role="alert">{renameError}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
