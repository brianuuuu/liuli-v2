import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { useRestoreListPosition } from "../components/listReturn";
import { PullToRefresh } from "../components/PullToRefresh";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import { formatDateTime } from "../utils/format";
import { rememberTaskTab, tasksReturn } from "./tasksViewState";

/** 预警页签只放未读：处理（标记已读或已处理）一个，它就从列表里消失。 */
export function AlertsContent() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const listRef = useRef<HTMLElement>(null);
  const query = useInfiniteQuery({
    queryKey: ["alerts"],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => mobileApi.unreadAlerts(pageParam, 50, signal),
    getNextPageParam: (last) => last.has_more ? last.offset + last.limit : undefined
  });
  // 处理掉的条目让后续分页整体前移，重拉时可能和已加载页重叠，按 id 去重。
  const events = useMemo(() => {
    const map = new Map<number, NonNullable<typeof query.data>["pages"][number]["items"][number]>();
    query.data?.pages.flatMap((page) => page.items).forEach((item) => map.set(item.id, item));
    return [...map.values()];
  }, [query.data]);
  /** 下拉刷新回到第一页，否则 refetch 会把已翻出来的几十页全部重拉一遍。 */
  const refresh = async () => {
    client.setQueryData(["alerts"], (current: typeof query.data) => current ? {
      ...current,
      pages: current.pages.slice(0, 1),
      pageParams: current.pageParams.slice(0, 1)
    } : current);
    const result = await query.refetch();
    if (result.isError) throw result.error;
  };
  useRestoreListPosition(listRef, !query.isLoading, tasksReturn, "alerts");
  const openEvent = (id: number) => {
    // 页签切换动画没走完就点进来时，页签还没记上，这里补记一次
    rememberTaskTab("alerts");
    tasksReturn.remember("alerts", listRef.current, id);
    navigate(`/tasks/alerts/${id}`);
  };
  return (
    <section className="tasks-panel" ref={listRef}>
      <PullToRefresh ariaLabel="预警事件下拉刷新" onRefresh={refresh}>
        {query.isLoading ? <LoadingState />
          : query.isError ? <ErrorState message="预警事件加载失败" onRetry={() => void query.refetch()} />
          : !events.length ? <EmptyState title="没有未读预警" detail="新预警出现后会显示在这里" />
          : <div className="alert-list">{events.map((event) => <article key={event.id} data-return-id={event.id} className={`alert-card alert-card--${event.event_level} is-unread`} onClick={() => openEvent(event.id)}><header><span>未读</span><time>{formatDateTime(event.event_time)}</time></header><h2>{event.title}</h2><p>{event.message}</p></article>)}{query.hasNextPage ? <button className="load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "加载中…" : "加载更多"}</button> : null}</div>}
      </PullToRefresh>
    </section>
  );
}
