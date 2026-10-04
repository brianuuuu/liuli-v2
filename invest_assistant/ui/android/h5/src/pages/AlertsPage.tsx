import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { PullToRefresh } from "../components/PullToRefresh";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import { formatDateTime } from "../utils/format";
import { rememberAlertAnchor, rememberTaskTab, takeAlertAnchor } from "./tasksViewState";

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
  // 从详情返回：点过的那条还在就摆回原来离视口顶部的位置；已处理不在了就退回原 scrollY。
  // 取锚点放在帧回调里，StrictMode 下第一次 effect 被取消时不会把锚点白白消费掉。
  useEffect(() => {
    if (query.isLoading) return;
    const frame = window.requestAnimationFrame(() => {
      const anchor = takeAlertAnchor();
      if (!anchor) return;
      const element = listRef.current?.querySelector<HTMLElement>(`[data-alert-id="${anchor.eventId}"]`);
      const top = element ? window.scrollY + element.getBoundingClientRect().top - anchor.offset : anchor.scrollY;
      window.scrollTo({ top, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [query.isLoading]);
  const openEvent = (id: number) => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-alert-id="${id}"]`);
    // 页签切换动画没走完就点进来时，页签还没记上，这里补记一次
    rememberTaskTab("alerts");
    rememberAlertAnchor({ eventId: id, offset: element?.getBoundingClientRect().top ?? 0, scrollY: window.scrollY });
    navigate(`/tasks/alerts/${id}`);
  };
  return (
    <section className="tasks-panel" ref={listRef}>
      <PullToRefresh ariaLabel="预警事件下拉刷新" onRefresh={refresh}>
        {query.isLoading ? <LoadingState />
          : query.isError ? <ErrorState message="预警事件加载失败" onRetry={() => void query.refetch()} />
          : !events.length ? <EmptyState title="没有未读预警" detail="新预警出现后会显示在这里" />
          : <div className="alert-list">{events.map((event) => <article key={event.id} data-alert-id={event.id} className={`alert-card alert-card--${event.event_level} is-unread`} onClick={() => openEvent(event.id)}><header><span>未读</span><time>{formatDateTime(event.event_time)}</time></header><h2>{event.title}</h2><p>{event.message}</p></article>)}{query.hasNextPage ? <button className="load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "加载中…" : "加载更多"}</button> : null}</div>}
      </PullToRefresh>
    </section>
  );
}
