import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { mobileApi } from "../api/mobileApi";
import { EmptyState, ErrorState, LoadingState } from "../components/Ui";
import type { AiTagSuggestion, AiTagSuggestionApprove } from "../types/api";
import { formatDateTime, formatNumber } from "../utils/format";

type SuggestionStatus = "pending" | "approved" | "rejected";
type TargetType = AiTagSuggestionApprove["target_type"];

const statusItems: Array<{ key: SuggestionStatus; label: string }> = [
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已拒绝" }
];

export function AiSuggestionsPanel() {
  const client = useQueryClient();
  const [status, setStatus] = useState<SuggestionStatus>("pending");
  const [searchDraft, setSearchDraft] = useState("");
  const [queryText, setQueryText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [approving, setApproving] = useState<AiTagSuggestion | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["ai-tag-suggestions", status, queryText],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => mobileApi.aiTagSuggestions({
      status,
      q: queryText || undefined,
      limit: 20,
      offset: pageParam
    }, signal),
    getNextPageParam: (last) => last.has_more ? last.offset + last.limit : undefined
  });
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["ai-tag-suggestions"] });
  };
  const reject = useMutation({ mutationFn: mobileApi.rejectAiTagSuggestion, onSuccess: refresh });
  const restore = useMutation({ mutationFn: mobileApi.restoreAiTagSuggestion, onSuccess: refresh });

  return (
    <section className="tasks-panel">
      <div className="tasks-toolbar" data-swipe-ignore="true">
        <form
          className="compact-search"
          onSubmit={(event) => {
            event.preventDefault();
            setQueryText(searchDraft.trim());
          }}
        >
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索推荐词" />
          <button type="submit" aria-label="搜索"><Search size={17} /></button>
        </form>
        <button type="button" className="icon-primary-button" aria-label="新增 AI 推荐词" onClick={() => setCreateOpen(true)}>
          <Plus size={18} />
        </button>
      </div>
      <div className="segmented tasks-status-filter" data-swipe-ignore="true">
        {statusItems.map((item) => (
          <button type="button" key={item.key} className={item.key === status ? "is-active" : ""} onClick={() => setStatus(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      {query.isLoading ? <LoadingState /> : query.isError ? (
        <ErrorState message="AI 推荐词加载失败" onRetry={() => void query.refetch()} />
      ) : rows.length ? (
        <div className="suggestion-list">
          {rows.map((item) => (
            <article className="suggestion-card" key={item.id}>
              <header>
                <strong>{item.suggested_text}</strong>
                <span className={`suggestion-status suggestion-status--${item.status}`}>{statusLabel(item.status)}</span>
              </header>
              <div className="suggestion-meta">
                <span>分数 {item.score == null ? "-" : formatNumber(item.score, 1)}</span>
                <span>拒绝 {item.rejected_count || 0} 次</span>
                <time>{formatDateTime(item.created_at)}</time>
              </div>
              {item.final_tag_name ? <p>最终标签：{item.final_tag_name}</p> : null}
              {item.reason ? <p>{item.reason}</p> : null}
              <footer>
                {item.status === "pending" ? (
                  <>
                    <button type="button" onClick={() => setApproving(item)}>通过</button>
                    <button
                      type="button"
                      className="danger-text"
                      disabled={reject.isPending}
                      onClick={() => {
                        if (window.confirm(`拒绝推荐词“${item.suggested_text}”？`)) reject.mutate(item.id);
                      }}
                    >
                      拒绝
                    </button>
                  </>
                ) : item.status === "rejected" ? (
                  <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(item.id)}>恢复</button>
                ) : null}
              </footer>
            </article>
          ))}
          {query.hasNextPage ? (
            <button className="load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {query.isFetchingNextPage ? "加载中…" : "加载更多"}
            </button>
          ) : null}
        </div>
      ) : <EmptyState title="暂无 AI 推荐词" detail="可新增推荐词，或切换状态查看历史记录" />}
      {createOpen ? <CreateSuggestionSheet onClose={() => setCreateOpen(false)} onSaved={refresh} /> : null}
      {approving ? <ApproveSuggestionSheet item={approving} onClose={() => setApproving(null)} onSaved={refresh} /> : null}
    </section>
  );
}

function CreateSuggestionSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const create = useMutation({
    mutationFn: () => mobileApi.createAiTagSuggestion({
      suggested_text: text.trim(),
      score: score === "" ? null : Number(score),
      reason: reason.trim() || null
    }),
    onSuccess: async () => {
      await onSaved();
      onClose();
    }
  });
  return (
    <div className="sheet-backdrop">
      <section className="composer-sheet" data-swipe-ignore="true">
        <header><strong>新增 AI 推荐词</strong><button type="button" onClick={onClose}><X /></button></header>
        <label>推荐词<input autoFocus value={text} onChange={(event) => setText(event.target.value)} /></label>
        <label>分数<input type="number" step="0.1" value={score} onChange={(event) => setScore(event.target.value)} /></label>
        <label>原因<textarea className="compact-textarea" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        {create.isError ? <span className="form-error">新增失败，请检查内容后重试</span> : null}
        <button className="primary-button" disabled={!text.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "保存中…" : "保存"}
        </button>
      </section>
    </div>
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
  return (
    <div className="sheet-backdrop">
      <section className="composer-sheet approve-sheet" data-swipe-ignore="true">
        <header><strong>通过 AI 推荐词</strong><button type="button" onClick={onClose}><X /></button></header>
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
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "pending") return "待审核";
  if (status === "approved") return "已通过";
  return "已拒绝";
}
