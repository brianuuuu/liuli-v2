import { useEffect, useRef } from "react";
import { EmptyState } from "./Ui";
import { MaterialCard, type MaterialCardItem } from "./MaterialCard";

export type DashboardMaterialItem = MaterialCardItem & {
  entityId?: number | null;
};

type Props = {
  items: DashboardMaterialItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onLoadMore: () => void;
  /** 整卡点击：进材料详情。实体入口收到材料详情页里，卡片上不再单独挂可点的实体名。 */
  onOpen: (item: DashboardMaterialItem) => void;
};

export function DashboardMaterialFeed({
  items,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onLoadMore,
  onOpen
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
    <div className="material-list">
      {items.map((item) => (
        <MaterialCard key={item.id} item={item} onOpen={() => onOpen(item)} />
      ))}
      <div className="material-load" ref={sentinelRef}>
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
