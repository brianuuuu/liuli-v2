import { useEffect, useRef } from "react";
import { EmptyState } from "./Ui";
import { formatDateTime } from "../utils/format";

export type DashboardMaterialItem = {
  id: number;
  entityName: string;
  entityCode?: string | null;
  direction?: string | null;
  title?: string | null;
  summary?: string | null;
  sourceName?: string | null;
  materialTime?: string | null;
};

type Props = {
  items: DashboardMaterialItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onLoadMore: () => void;
};

const directionPresentation: Record<string, { label: string; tone: string }> = {
  support: { label: "利好", tone: "positive" },
  positive: { label: "利好", tone: "positive" },
  weaken: { label: "利空", tone: "negative" },
  negative: { label: "利空", tone: "negative" },
  neutral: { label: "中性", tone: "neutral" }
};

export function DashboardMaterialFeed({
  items,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onLoadMore
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestPendingRef = useRef(false);
  const sawFetchingRef = useRef(false);
  const supportsObserver = typeof IntersectionObserver !== "undefined";

  useEffect(() => {
    if (isFetchingNextPage) {
      sawFetchingRef.current = true;
    } else if (sawFetchingRef.current) {
      sawFetchingRef.current = false;
      requestPendingRef.current = false;
    }
  }, [isFetchingNextPage]);

  useEffect(() => {
    if (!supportsObserver || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || requestPendingRef.current) return;
      requestPendingRef.current = true;
      onLoadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchNextPageError, isFetchingNextPage, onLoadMore, supportsObserver]);

  if (!items.length) return <EmptyState title="暂无最新材料" />;

  return (
    <div className="dashboard-material-list">
      {items.map((item) => {
        const direction = item.direction ? directionPresentation[item.direction] : undefined;
        const metadata = [
          item.sourceName?.trim(),
          item.materialTime ? formatDateTime(item.materialTime) : undefined
        ].filter(Boolean).join(" · ") || "--";
        return (
          <article className="dashboard-material-item" key={item.id}>
            <header className="dashboard-material-item__entity">
              <strong>{item.entityName?.trim() || "--"}</strong>
              {item.entityCode ? <span>{item.entityCode}</span> : null}
              {direction ? (
                <em className={`material-direction material-direction--${direction.tone}`}>
                  {direction.label}
                </em>
              ) : null}
            </header>
            <h3>{item.title?.trim() || "--"}</h3>
            {item.summary?.trim() ? <p>{item.summary}</p> : null}
            <footer>{metadata}</footer>
          </article>
        );
      })}
      <div className="dashboard-material-load" ref={sentinelRef}>
        {isFetchNextPageError ? (
          <button type="button" className="load-more" onClick={onLoadMore}>重试加载</button>
        ) : isFetchingNextPage ? (
          <span>加载中…</span>
        ) : hasNextPage ? (
          supportsObserver ? <span>继续上滑加载</span> : (
            <button type="button" className="load-more" onClick={onLoadMore}>加载更多</button>
          )
        ) : <span>没有更多材料</span>}
      </div>
    </div>
  );
}
