import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import type { AiTagSuggestion } from "../types/api";

export function aiSuggestionSessionKey(id: number) {
  return `liuli.mobile.ai-suggestion.${id}`;
}

export function AiSuggestionsPanel() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set());
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState("");
  const batchRunning = useRef(false);
  const query = useInfiniteQuery({
    queryKey: ["ai-tag-suggestions", "pending"],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => mobileApi.aiTagSuggestions({
      status: "pending",
      limit: 20,
      offset: pageParam
    }, signal),
    getNextPageParam: (last) => last.has_more ? last.offset + last.limit : undefined
  });
  const rows = useMemo(
    () => (query.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => !removedIds.has(item.id)),
    [query.data, removedIds]
  );

  const rejectLoaded = async () => {
    if (batchRunning.current || !rows.length) return;
    batchRunning.current = true;
    const loadedRows = [...rows];
    setFeedback("");
    setBatchProgress({ current: 0, total: loadedRows.length });
    const succeeded: number[] = [];
    for (let index = 0; index < loadedRows.length; index += 1) {
      try {
        await mobileApi.rejectAiTagSuggestion(loadedRows[index].id);
        succeeded.push(loadedRows[index].id);
      } catch {
        // Continue so one failed request does not block the remaining loaded rows.
      }
      setBatchProgress({ current: index + 1, total: loadedRows.length });
    }
    setRemovedIds((current) => new Set([...current, ...succeeded]));
    setBatchProgress(null);
    batchRunning.current = false;
    setFeedback(
      succeeded.length === loadedRows.length
        ? `已拒绝 ${succeeded.length} 条推荐词`
        : `已拒绝 ${succeeded.length} 条，${loadedRows.length - succeeded.length} 条失败`
    );
    await client.invalidateQueries({ queryKey: ["ai-tag-suggestions"] });
  };

  const openReview = (item: AiTagSuggestion) => {
    window.sessionStorage.setItem(aiSuggestionSessionKey(item.id), JSON.stringify(item));
    navigate(`/tasks/suggestions/${item.id}`, { state: { suggestion: item } });
  };

  return (
    <section className="tasks-panel ai-suggestions-panel">
      <div className="suggestion-review-hint">
        <span>待审核 {query.data?.pages[0]?.total ?? 0}</span>
        <span>点击卡片进入审核</span>
      </div>
      {query.isLoading ? <LoadingState /> : query.isError ? (
        <ErrorState message="AI 推荐词加载失败" onRetry={() => void query.refetch()} />
      ) : rows.length ? (
        <div className="suggestion-list">
          {rows.map((item) => (
            <button type="button" className="suggestion-card" key={item.id} onClick={() => openReview(item)}>
              <span className="suggestion-card__content">
                <strong>{item.suggested_text}</strong>
                {item.reason ? <span>{item.reason}</span> : null}
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
          <div className="suggestion-list-actions" data-swipe-ignore="true">
            {query.hasNextPage ? (
              <button className="load-more" disabled={query.isFetchingNextPage || Boolean(batchProgress)} onClick={() => void query.fetchNextPage()}>
                {query.isFetchingNextPage ? "加载中…" : "加载更多"}
              </button>
            ) : <span className="suggestion-list-end">已加载全部</span>}
            <button
              type="button"
              className="reject-loaded-button"
              aria-label="一键拒绝已加载推荐词"
              disabled={Boolean(batchProgress)}
              onClick={() => void rejectLoaded()}
            >
              {batchProgress ? `拒绝中 ${batchProgress.current}/${batchProgress.total}` : "一键拒绝"}
            </button>
          </div>
        </div>
      ) : <EmptyState title="暂无待审核推荐词" detail="新的推荐词会显示在这里" />}
      {feedback ? <div className="batch-feedback" role="status">{feedback}</div> : null}
    </section>
  );
}
