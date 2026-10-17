import { CheckCircleOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type TodoListItem = {
  title: ReactNode;
  meta: ReactNode;
  aside?: ReactNode;
};

type TodoPaneProps<T> = {
  load: () => Promise<T[]>;
  itemKey: (item: T) => number;
  renderItem: (item: T) => TodoListItem;
  /** resolve：当前条目处理完后调用，重新拉列表并自动选中下一条 */
  renderDetail: (item: T, resolve: () => Promise<void>) => ReactNode;
  emptyText: string;
  onChanged: () => void;
};

/**
 * 待办通用的"列表 + 详情"两栏。处理完一条自动落到同位置的下一条，连续处理不用来回点。
 */
export function TodoPane<T>({ load, itemKey, renderItem, renderDetail, emptyText, onChanged }: TodoPaneProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const rowsRef = useRef<T[]>([]);
  // itemKey 通常是内联箭头函数，放进依赖会让每次渲染都重新拉列表
  const keyOf = useRef(itemKey);
  keyOf.current = itemKey;

  const reload = useCallback(
    async (preferIndex?: number) => {
      setLoading(true);
      try {
        const next = await load();
        rowsRef.current = next;
        setRows(next);
        setSelectedKey((current) => {
          if (current != null && next.some((item) => keyOf.current(item) === current)) return current;
          if (!next.length) return null;
          return keyOf.current(next[Math.min(preferIndex ?? 0, next.length - 1)]);
        });
      } finally {
        setLoading(false);
      }
    },
    [load]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = rows.find((item) => itemKey(item) === selectedKey) ?? null;

  const resolve = useCallback(async () => {
    const index = rowsRef.current.findIndex((item) => keyOf.current(item) === selectedKey);
    setSelectedKey(null);
    await reload(Math.max(index, 0));
    onChanged();
  }, [onChanged, reload, selectedKey]);

  if (!loading && !rows.length) {
    return (
      <div className="todo-pane-empty">
        <CheckCircleOutlined />
        <span>{emptyText}</span>
      </div>
    );
  }

  return (
    <div className="todo-pane">
      <div className="todo-list" role="listbox">
        {loading && !rows.length ? <Spin className="todo-pane-spin" /> : null}
        {rows.map((item) => {
          const key = itemKey(item);
          const view = renderItem(item);
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={key === selectedKey}
              className={key === selectedKey ? "todo-list-item active" : "todo-list-item"}
              onClick={() => setSelectedKey(key)}
            >
              <span className="todo-list-item-main">
                <span className="todo-list-item-title">{view.title}</span>
                <span className="todo-list-item-meta">{view.meta}</span>
              </span>
              {view.aside ? <span className="todo-list-item-aside">{view.aside}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="todo-detail">{selected ? renderDetail(selected, resolve) : null}</div>
    </div>
  );
}

export function TodoDetail({ title, meta, children, actions }: { title: ReactNode; meta?: ReactNode; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="todo-detail-inner">
      <div className="todo-detail-head">
        <h4>{title}</h4>
        {meta ? <div className="todo-detail-meta">{meta}</div> : null}
      </div>
      <div className="todo-detail-body">{children}</div>
      <div className="todo-detail-actions">{actions}</div>
    </div>
  );
}

export function TodoSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="todo-detail-section">
      <div className="todo-detail-label">{label}</div>
      {children}
    </section>
  );
}
