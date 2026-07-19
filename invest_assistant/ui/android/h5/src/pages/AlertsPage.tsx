import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { alertMatchesTab, type AlertTab } from "../api/filters";
import { mobileApi } from "../api/mobileApi";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import { formatDateTime } from "../utils/format";

const tabs = [{ key: "all", label: "全部" }, { key: "unread", label: "未读" }, { key: "handled", label: "已处理" }] as const;

export function AlertsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AlertTab>("all");
  const pager = useRef<HorizontalTabPagerHandle<AlertTab>>(null);
  const query = useInfiniteQuery({
    queryKey: ["alerts"],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => mobileApi.alerts(pageParam, 50, signal),
    getNextPageParam: (last) => last.has_more ? last.offset + last.limit : undefined
  });
  const allEvents = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const renderPage = (key: AlertTab) => {
    const events = allEvents.filter((item) => alertMatchesTab(key, item));
    return <AlertTabContent active={key === tab} events={events} query={query} navigate={navigate} />;
  };
  return <MobilePageFrame navigation={<SecondaryNavigation items={tabs} activeKey={tab} onChange={(key) => pager.current?.requestChange(key)} />}><HorizontalTabPager ref={pager} items={tabs} activeKey={tab} onChange={setTab} renderPage={renderPage} /></MobilePageFrame>;
}

type AlertsQuery = ReturnType<typeof useInfiniteQuery<Awaited<ReturnType<typeof mobileApi.alerts>>, Error>>;

function AlertTabContent({
  active,
  events,
  query,
  navigate
}: {
  active: boolean;
  events: Awaited<ReturnType<typeof mobileApi.alerts>>["items"];
  query: AlertsQuery;
  navigate: ReturnType<typeof useNavigate>;
}) {
  useEffect(() => {
    if (active && !query.isLoading && !query.isError && !events.length && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [active, events.length, query.hasNextPage, query.isError, query.isFetchingNextPage, query.isLoading, query.fetchNextPage]);
  if (query.isLoading || (!events.length && query.isFetchingNextPage)) return <LoadingState />;
  if (query.isError) return <ErrorState message="预警事件加载失败" onRetry={() => void query.refetch()} />;
  if (!events.length) return <EmptyState title="当前没有预警" detail="事件出现后会显示在这里" />;
  return <section><div className="alert-list">{events.map((event) => <article key={event.id} className={`alert-card alert-card--${event.event_level} ${event.status === "unread" ? "is-unread" : ""}`} onClick={() => navigate(`/alerts/${event.id}`)}><header><span>{event.status === "handled" ? "已处理" : event.status === "unread" ? "未读" : "已读"}</span><time>{formatDateTime(event.event_time)}</time></header><h2>{event.title}</h2><p>{event.message}</p></article>)}{query.hasNextPage ? <button className="load-more" onClick={() => void query.fetchNextPage()}>加载更多</button> : null}</div></section>;
}
