import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { newsQueryForTab, type NewsTab } from "../api/filters";
import { mobileApi } from "../api/mobileApi";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import type { PagerMotionSink } from "../components/pagerMotion";
import { PullToRefresh } from "../components/PullToRefresh";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import { formatDateTime, formatDay } from "../utils/format";

const tabs = [
  { key: "all", label: "全部" },
  { key: "important", label: "重要" },
  { key: "announcement", label: "公告" },
  { key: "stock", label: "个股" }
] as const;

export function NewsPage() {
  const [tab, setTab] = useState<NewsTab>("all");
  const pager = useRef<HorizontalTabPagerHandle<NewsTab>>(null);
  const navigationMotion = useRef<PagerMotionSink | null>(null);
  return <MobilePageFrame navigation={<SecondaryNavigation ref={navigationMotion} items={tabs} activeKey={tab} onChange={(key) => pager.current?.requestChange(key)} />}><HorizontalTabPager ref={pager} items={tabs} activeKey={tab} onChange={setTab} motionSink={navigationMotion} renderPage={(key) => <NewsTimeline tab={key} />} /></MobilePageFrame>;
}

function NewsTimeline({ tab }: { tab: NewsTab }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["news", tab],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => mobileApi.news({ limit: 30, offset: pageParam, ...newsQueryForTab(tab) }, signal),
    getNextPageParam: (last) => last.has_more ? last.offset + last.limit : undefined
  });
  const items = useMemo(() => {
    const map = new Map<number, NonNullable<typeof query.data>["pages"][number]["items"][number]>();
    query.data?.pages.flatMap((page) => page.items).forEach((item) => map.set(item.id, item));
    return [...map.values()];
  }, [query.data]);
  const refresh = async () => {
    queryClient.setQueryData(["news", tab], (current: typeof query.data) => current ? {
      ...current,
      pages: current.pages.slice(0, 1),
      pageParams: current.pageParams.slice(0, 1)
    } : current);
    await query.refetch();
  };
  let lastDay = "";
  return <section><PullToRefresh ariaLabel="资讯下拉刷新" onRefresh={refresh}>{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="资讯加载失败" onRetry={() => void query.refetch()} /> : items.length ? <div className="timeline-list">{items.map((item) => { const day = formatDay(item.publish_time ?? item.created_at); const showDay = day !== lastDay; lastDay = day; return <div key={item.id}>{showDay ? <div className="timeline-day">{day}</div> : null}<article className="timeline-item" onClick={() => navigate(`/news/${item.id}`)}><div className="timeline-dot" /><time>{formatDateTime(item.publish_time ?? item.created_at).split(" ").at(-1)}</time><h2>{item.title}</h2><p>{item.content?.slice(0, 160)}</p><footer><span>{item.source_name}</span>{item.source_tags?.slice(0, 3).map((tag) => <em key={tag.id}>#{tag.tag?.name}</em>)}</footer></article></div>; })}{query.hasNextPage ? <button className="load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "加载中…" : "加载更多"}</button> : null}</div> : <EmptyState title="暂无资讯" detail="当前筛选没有内容" />}</PullToRefresh></section>;
}
