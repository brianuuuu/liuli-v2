import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mobileApi } from "../api/mobileApi";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import type { AiTagSuggestion, AiTagSuggestionApprove } from "../types/api";
import { formatDateTime, formatNumber } from "../utils/format";

type TargetType = AiTagSuggestionApprove["target_type"];

const longPressDelay = 1000;
const longPressMoveTolerance = 10;

export function AiSuggestionsPanel() {
  const client = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [approving, setApproving] = useState<AiTagSuggestion | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set());
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState("");
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
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["ai-tag-suggestions"] });
  };
  const reject = useMutation({
    mutationFn: mobileApi.rejectAiTagSuggestion,
    onSuccess: async (_, id) => {
      setRemovedIds((current) => new Set(current).add(id));
      setActiveId(null);
      await refresh();
    }
  });

  const rejectLoaded = async () => {
    const loadedRows = [...rows];
    if (!loadedRows.length || !window.confirm(`拒绝当前已加载的 ${loadedRows.length} 条推荐词？`)) return;
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
    setActiveId(null);
    setBatchProgress(null);
    setFeedback(
      succeeded.length === loadedRows.length
        ? `已拒绝 ${succeeded.length} 条推荐词`
        : `已拒绝 ${succeeded.length} 条，${loadedRows.length - succeeded.length} 条失败`
    );
    await refresh();
  };

  return (
    <section className="tasks-panel ai-suggestions-panel">
      <div className="suggestion-review-hint">
        <span>待审核 {query.data?.pages[0]?.total ?? 0}</span>
        <span>长按卡片 1 秒进行审核</span>
      </div>
      {query.isLoading ? <LoadingState /> : query.isError ? (
        <ErrorState message="AI 推荐词加载失败" onRetry={() => void query.refetch()} />
      ) : rows.length ? (
        <div className="suggestion-list">
          {rows.map((item) => (
            <SuggestionCard
              key={item.id}
              item={item}
              active={activeId === item.id}
              disabled={reject.isPending || Boolean(batchProgress)}
              onActivate={() => setActiveId(item.id)}
              onApprove={() => setApproving(item)}
              onReject={() => {
                if (window.confirm(`拒绝推荐词“${item.suggested_text}”？`)) reject.mutate(item.id);
              }}
            />
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
      {feedback ? createPortal(<div className="operation-feedback" role="status">{feedback}</div>, document.body) : null}
      {approving ? (
        <ApproveSuggestionSheet
          item={approving}
          onClose={() => setApproving(null)}
          onSaved={async () => {
            setRemovedIds((current) => new Set(current).add(approving.id));
            setActiveId(null);
            await refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function SuggestionCard({
  item,
  active,
  disabled,
  onActivate,
  onApprove,
  onReject
}: {
  item: AiTagSuggestion;
  active: boolean;
  disabled: boolean;
  onActivate: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <article
      className={`suggestion-card ${active ? "is-reviewing" : ""}`}
      data-swipe-ignore="true"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        origin.current = { x: event.clientX, y: event.clientY };
        cancelPress();
        timer.current = setTimeout(() => {
          onActivate();
          timer.current = null;
          if ("vibrate" in navigator) navigator.vibrate(20);
        }, longPressDelay);
      }}
      onPointerMove={(event) => {
        if (
          Math.abs(event.clientX - origin.current.x) > longPressMoveTolerance
          || Math.abs(event.clientY - origin.current.y) > longPressMoveTolerance
        ) cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
    >
      <header>
        <strong>{item.suggested_text}</strong>
        <time>{formatDateTime(item.created_at)}</time>
      </header>
      <div className="suggestion-meta">
        <span>评分 {item.score == null ? "-" : formatNumber(item.score, 1)}</span>
        <span>历史拒绝 {item.rejected_count || 0} 次</span>
      </div>
      {item.reason ? <p>{item.reason}</p> : null}
      {active ? (
        <footer className="suggestion-review-actions">
          <button type="button" aria-label={`通过${item.suggested_text}`} disabled={disabled} onClick={onApprove}>
            <Check size={16} />通过
          </button>
          <button type="button" aria-label={`拒绝${item.suggested_text}`} className="danger-text" disabled={disabled} onClick={onReject}>
            <X size={16} />拒绝
          </button>
        </footer>
      ) : null}
    </article>
  );
}

function ApproveSuggestionSheet({
  item,
  onClose,
  onSaved
}: {
  item: AiTagSuggestion;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [finalName, setFinalName] = useState(item.final_tag_name || item.suggested_text);
  const [targetType, setTargetType] = useState<TargetType>("hotword");
  const [targetId, setTargetId] = useState("");
  const [targetName, setTargetName] = useState("");
  const [stockKeyword, setStockKeyword] = useState("");
  const hotwords = useQuery({ queryKey: ["hotword-options"], queryFn: mobileApi.hotwordOptions, enabled: targetType === "hotword" });
  const tracks = useQuery({ queryKey: ["track-options"], queryFn: mobileApi.trackOptions, enabled: targetType === "track" });
  const stocks = useQuery({
    queryKey: ["stock-options", stockKeyword],
    queryFn: () => mobileApi.stockOptions(stockKeyword.trim()),
    enabled: targetType === "stock" && Boolean(stockKeyword.trim())
  });
  const options = targetType === "hotword"
    ? hotwords.data?.items.map((option) => ({ id: option.id, label: option.name })) ?? []
    : targetType === "track"
      ? tracks.data?.map((option) => ({ id: option.id, label: option.name })) ?? []
      : stocks.data?.map((option) => ({
        id: option.id,
        label: option.stock_name || option.name || option.stock_code || option.symbol || "未命名标的"
      })) ?? [];
  const approve = useMutation({
    mutationFn: () => mobileApi.approveAiTagSuggestion(item.id, {
      final_tag_name: finalName.trim() || null,
      target_type: targetType,
      target_id: targetId ? Number(targetId) : null,
      target_name: targetType === "stock" ? null : targetName.trim() || finalName.trim() || item.suggested_text
    }),
    onSuccess: async () => {
      await onSaved();
      onClose();
    }
  });
  const valid = targetType !== "stock" || Boolean(targetId);
  return createPortal(
    <div className="sheet-backdrop viewport-sheet-backdrop" onClick={onClose}>
      <section
        className="composer-sheet approve-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="通过 AI 推荐词"
        data-swipe-ignore="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header><strong>通过 AI 推荐词</strong><button type="button" aria-label="关闭审核面板" onClick={onClose}><X /></button></header>
        <label>最终标签词<input value={finalName} onChange={(event) => setFinalName(event.target.value)} /></label>
        <label>绑定对象
          <select
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value as TargetType);
              setTargetId("");
              setTargetName("");
              setStockKeyword("");
            }}
          >
            <option value="hotword">市场热词</option>
            <option value="track">赛道</option>
            <option value="stock">标的</option>
          </select>
        </label>
        {targetType === "stock" ? (
          <label>搜索已有标的<input value={stockKeyword} onChange={(event) => setStockKeyword(event.target.value)} placeholder="名称 / 代码 / 拼音" /></label>
        ) : null}
        <label>已有对象
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">{targetType === "stock" ? "请选择已有标的" : "不选择，按名称新建"}</option>
            {options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
          </select>
        </label>
        {targetType !== "stock" ? (
          <label>新对象名称<input value={targetName} onChange={(event) => setTargetName(event.target.value)} placeholder={finalName} /></label>
        ) : null}
        {approve.isError ? <span className="form-error">审核失败，请检查绑定对象后重试</span> : null}
        <button className="primary-button" disabled={!valid || approve.isPending} onClick={() => approve.mutate()}>
          {approve.isPending ? "提交中…" : "确认通过"}
        </button>
      </section>
    </div>,
    document.body
  );
}
