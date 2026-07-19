import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { alertMatchesTab, type AlertTab } from "../api/filters";
import { mobileApi } from "../api/mobileApi";
import { useSwipeTabs } from "../app/swipe";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import { formatDateTime } from "../utils/format";

const tabs = [{ key: "all", label: "全部" }, { key: "unread", label: "未读" }, { key: "handled", label: "已处理" }] as const;

export function AlertsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AlertTab>("all");
  const query = useInfiniteQuery({
    queryKey: ["alerts"],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => mobileApi.alerts(pageParam, 50, signal),
    getNextPageParam: (last) => last.has_more ? last.offset + last.limit : undefined
  });
  const swipe = useSwipeTabs(tabs, tab, setTab);
  const events = useMemo(() => query.data?.pages.flatMap((page) => page.items).filter((item) => alertMatchesTab(tab, item)) ?? [], [query.data, tab]);
  return <MobilePageFrame navigation={<SecondaryNavigation items={tabs} activeKey={tab} onChange={setTab} />}><section {...swipe}>{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="预警事件加载失败" onRetry={() => void query.refetch()} /> : events.length ? <div className="alert-list">{events.map((event) => <article key={event.id} className={`alert-card alert-card--${event.event_level} ${event.status === "unread" ? "is-unread" : ""}`} onClick={() => navigate(`/alerts/${event.id}`)}><header><span>{event.status === "handled" ? "已处理" : event.status === "unread" ? "未读" : "已读"}</span><time>{formatDateTime(event.event_time)}</time></header><h2>{event.title}</h2><p>{event.message}</p></article>)}{query.hasNextPage ? <button className="load-more" onClick={() => void query.fetchNextPage()}>加载更多</button> : null}</div> : <EmptyState title="当前没有预警" detail="事件出现后会显示在这里" />}</section></MobilePageFrame>;
}
