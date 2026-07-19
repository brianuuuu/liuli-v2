import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { newsQueryForTab, type NewsTab } from "../api/filters";
import { mobileApi } from "../api/mobileApi";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
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
  return <MobilePageFrame navigation={<SecondaryNavigation items={tabs} activeKey={tab} onChange={(key) => pager.current?.requestChange(key)} />}><HorizontalTabPager ref={pager} items={tabs} activeKey={tab} onChange={setTab} renderPage={(key) => <NewsTimeline tab={key} />} /></MobilePageFrame>;
}

function NewsTimeline({ tab }: { tab: NewsTab }) {
  const navigate = useNavigate();
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
  let lastDay = "";
  return <section><div className="timeline-toolbar"><span>{query.data?.pages[0]?.total ?? 0} 条</span><button type="button" onClick={() => void query.refetch()} aria-label="刷新新闻"><RefreshCw size={17} /></button></div>{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="新闻加载失败" onRetry={() => void query.refetch()} /> : items.length ? <div className="timeline-list">{items.map((item) => { const day = formatDay(item.publish_time ?? item.created_at); const showDay = day !== lastDay; lastDay = day; return <div key={item.id}>{showDay ? <div className="timeline-day">{day}</div> : null}<article className="timeline-item" onClick={() => navigate(`/news/${item.id}`)}><div className="timeline-dot" /><time>{formatDateTime(item.publish_time ?? item.created_at).split(" ").at(-1)}</time><h2>{item.title}</h2><p>{item.content?.slice(0, 160)}</p><footer><span>{item.source_name}</span>{item.source_tags?.slice(0, 3).map((tag) => <em key={tag.id}>#{tag.tag?.name}</em>)}</footer></article></div>; })}{query.hasNextPage ? <button className="load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "加载中…" : "加载更多"}</button> : null}</div> : <EmptyState title="暂无新闻" detail="当前筛选没有内容" />}</section>;
}
