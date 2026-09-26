import { infiniteQueryOptions, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { newsQueryForTab, type NewsTab } from "../api/filters";
import { mobileApi } from "../api/mobileApi";
import { HorizontalTabPager, type HorizontalTabPagerHandle } from "../components/HorizontalTabPager";
import { MobilePageFrame } from "../components/MobilePageFrame";
import type { PagerMotionSink } from "../components/pagerMotion";
import { PullToRefresh } from "../components/PullToRefresh";
import { SecondaryNavigation } from "../components/SecondaryNavigation";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import type { SourceItem } from "../types/api";
import { formatDateTime, formatDay } from "../utils/format";

const tabs = [
  { key: "all", label: "全部" },
  { key: "sentiment", label: "舆情" },
  { key: "important", label: "重要" },
  { key: "announcement", label: "公告" },
  { key: "stock", label: "个股" }
] as const;

// 作者筛选只作用在舆情页签：其他页签的 key 不带作者，切换作者不会让它们重拉。
function newsTimelineQuery(tab: NewsTab, author = "") {
  const authorFilter = tab === "sentiment" && author ? author : "";
  return infiniteQueryOptions({
    queryKey: ["news", tab, authorFilter],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => mobileApi.news({ limit: 30, offset: pageParam, ...newsQueryForTab(tab), author: authorFilter || undefined }, signal),
    getNextPageParam: (last) => last.has_more ? last.offset + last.limit : undefined
  });
}

export function NewsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<NewsTab>("all");
  // 重要页签是最常切的那个，进页面就先在后台把首屏拉好，切过去直接出列表，不用再看一次加载态。
  useEffect(() => { void queryClient.prefetchInfiniteQuery(newsTimelineQuery("important")); }, [queryClient]);
  const pager = useRef<HorizontalTabPagerHandle<NewsTab>>(null);
  const navigationMotion = useRef<PagerMotionSink | null>(null);
  const [author, setAuthor] = useState("");
  // 在任意页签点作者名，都跳到舆情页签只看这个人
  const selectAuthor = (name: string) => {
    setAuthor(name);
    pager.current?.requestChange("sentiment");
  };
  return <MobilePageFrame navigation={<SecondaryNavigation ref={navigationMotion} items={tabs} activeKey={tab} onChange={(key) => pager.current?.requestChange(key)} />}><HorizontalTabPager ref={pager} items={tabs} activeKey={tab} onChange={setTab} motionSink={navigationMotion} renderPage={(key) => <NewsTimeline tab={key} author={author} onSelectAuthor={selectAuthor} onClearAuthor={() => setAuthor("")} />} /></MobilePageFrame>;
}

function NewsTimeline({ tab, author, onSelectAuthor, onClearAuthor }: { tab: NewsTab; author: string; onSelectAuthor: (name: string) => void; onClearAuthor: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timelineQuery = newsTimelineQuery(tab, author);
  const query = useInfiniteQuery(timelineQuery);
  const authorFilter = tab === "sentiment" ? author : "";
  const items = useMemo(() => {
    const map = new Map<number, NonNullable<typeof query.data>["pages"][number]["items"][number]>();
    query.data?.pages.flatMap((page) => page.items).forEach((item) => map.set(item.id, item));
    return [...map.values()];
  }, [query.data]);
  const refresh = async () => {
    queryClient.setQueryData(timelineQuery.queryKey, (current: typeof query.data) => current ? {
      ...current,
      pages: current.pages.slice(0, 1),
      pageParams: current.pageParams.slice(0, 1)
    } : current);
    await query.refetch();
  };
  let lastDay = "";
  return <section>{authorFilter ? <div className="news-author-filter"><span>作者：{authorFilter}</span><button type="button" aria-label="清除作者筛选" onClick={onClearAuthor}><X size={14} /></button></div> : null}<PullToRefresh ariaLabel="资讯下拉刷新" onRefresh={refresh}>{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="资讯加载失败" onRetry={() => void query.refetch()} /> : items.length ? <div className="timeline-list">{items.map((item) => { const day = formatDay(item.publish_time ?? item.created_at); const showDay = day !== lastDay; lastDay = day; return <div key={item.id}>{showDay ? <div className="timeline-day">{day}</div> : null}{item.source_type === "sentiment" ? <SentimentCard item={item} onOpen={() => navigate(`/news/${item.id}`)} onSelectAuthor={onSelectAuthor} /> : <article className="timeline-item" onClick={() => navigate(`/news/${item.id}`)}><div className="timeline-dot" /><time>{formatDateTime(item.publish_time ?? item.created_at).split(" ").at(-1)}</time><h2>{item.title}</h2><p>{item.content?.slice(0, 160)}</p><footer><span>{item.source_name}</span>{item.source_tags?.slice(0, 3).map((tag) => <em key={tag.id}>#{tag.tag?.name}</em>)}</footer></article>}</div>; })}{query.hasNextPage ? <button className="load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "加载中…" : "加载更多"}</button> : null}</div> : <EmptyState title="暂无资讯" detail="当前筛选没有内容" />}</PullToRefresh></section>;
}

/** 舆情先看是谁说的，再看说了什么：标题只是正文前 40 字，不显示。 */
function SentimentCard({ item, onOpen, onSelectAuthor }: { item: SourceItem; onOpen: () => void; onSelectAuthor: (name: string) => void }) {
  return <article className="timeline-item sentiment-item" onClick={onOpen}><div className="timeline-dot" /><div className="sentiment-head">{item.author ? <button type="button" className="sentiment-author" onClick={(event) => { event.stopPropagation(); onSelectAuthor(item.author ?? ""); }}>{item.author}</button> : null}<span>{item.source_name}</span>{item.is_important ? <b>重要</b> : null}<time>{formatDateTime(item.publish_time ?? item.created_at).split(" ").at(-1)}</time></div><p>{item.content}</p>{item.source_tags?.length ? <footer>{item.source_tags.slice(0, 3).map((tag) => <em key={tag.id}>#{tag.tag?.name}</em>)}</footer> : null}</article>;
}
