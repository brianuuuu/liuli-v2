import { type InfiniteData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { mobileApi } from "../api/mobileApi";
import type { AiTagSuggestion, AiTagSuggestionApprove, PageDto } from "../types/api";
import { DetailFrame } from "./DetailPages";
import { aiSuggestionSessionKey } from "./AiSuggestionsPanel";

type TargetType = AiTagSuggestionApprove["target_type"];

export function AiSuggestionReviewPage() {
  const id = Number(useParams().id);
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const item = useMemo(
    () => resolveSuggestion(id, location.state, client),
    [client, id, location.state]
  );
  const [finalName, setFinalName] = useState(item?.final_tag_name || item?.suggested_text || "");
  const [targetType, setTargetType] = useState<TargetType>("hotword");
  const [targetId, setTargetId] = useState("");
  const [targetName, setTargetName] = useState("");
  const [stockKeyword, setStockKeyword] = useState("");
  const hotwords = useQuery({ queryKey: ["hotword-options"], queryFn: mobileApi.hotwordOptions, enabled: Boolean(item) && targetType === "hotword" });
  const tracks = useQuery({ queryKey: ["track-options"], queryFn: mobileApi.trackOptions, enabled: Boolean(item) && targetType === "track" });
  const stocks = useQuery({
    queryKey: ["stock-options", stockKeyword],
    queryFn: () => mobileApi.stockOptions(stockKeyword.trim()),
    enabled: Boolean(item) && targetType === "stock" && Boolean(stockKeyword.trim())
  });
  const options = targetType === "hotword"
    ? hotwords.data?.items.map((option) => ({ id: option.id, label: option.name })) ?? []
    : targetType === "track"
      ? tracks.data?.map((option) => ({ id: option.id, label: option.name })) ?? []
      : stocks.data?.map((option) => ({
        id: option.id,
        label: option.stock_name || option.name || option.stock_code || option.symbol || "未命名标的"
      })) ?? [];
  const finish = async () => {
    window.sessionStorage.removeItem(aiSuggestionSessionKey(id));
    await client.invalidateQueries({ queryKey: ["ai-tag-suggestions"] });
    navigate("/tasks", { replace: true });
  };
  const approve = useMutation({
    mutationFn: () => mobileApi.approveAiTagSuggestion(id, {
      final_tag_name: finalName.trim() || null,
      target_type: targetType,
      target_id: targetId ? Number(targetId) : null,
      target_name: targetType === "stock" ? null : targetName.trim() || finalName.trim() || item?.suggested_text
    }),
    onSuccess: finish
  });
  const reject = useMutation({
    mutationFn: () => mobileApi.rejectAiTagSuggestion(id),
    onSuccess: finish
  });

  if (!item) {
    return (
      <DetailFrame title="审核推荐词">
        <div className="empty-state empty-state--error">
          <strong>推荐词数据已失效</strong>
          <button type="button" className="text-button" onClick={() => navigate("/tasks", { replace: true })}>返回待办列表</button>
        </div>
      </DetailFrame>
    );
  }
  const valid = targetType !== "stock" || Boolean(targetId);
  const submitting = approve.isPending || reject.isPending;
  return (
    <DetailFrame title="审核推荐词">
      <div className="suggestion-review-detail">
        <section className="suggestion-review-summary">
          <h2>{item.suggested_text}</h2>
          {item.reason ? <p>{item.reason}</p> : <p>暂无推荐理由</p>}
        </section>
        <div className="suggestion-review-form">
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
          {approve.isError || reject.isError ? <span className="form-error">审核失败，请重试</span> : null}
          <div className="suggestion-review-submit">
            <button type="button" className="primary-button" disabled={!valid || submitting} onClick={() => approve.mutate()}>
              <Check size={17} />{approve.isPending ? "提交中…" : "通过"}
            </button>
            <button type="button" className="danger-button" disabled={submitting} onClick={() => reject.mutate()}>
              <X size={17} />{reject.isPending ? "拒绝中…" : "拒绝"}
            </button>
          </div>
        </div>
      </div>
    </DetailFrame>
  );
}

function resolveSuggestion(id: number, state: unknown, client: ReturnType<typeof useQueryClient>) {
  const fromState = (state as { suggestion?: AiTagSuggestion } | null)?.suggestion;
  if (fromState?.id === id) return fromState;
  const cached = client.getQueriesData<InfiniteData<PageDto<AiTagSuggestion>>>({ queryKey: ["ai-tag-suggestions"] });
  for (const [, data] of cached) {
    const match = data?.pages.flatMap((page) => page.items).find((suggestion) => suggestion.id === id);
    if (match) return match;
  }
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(aiSuggestionSessionKey(id)) || "null") as AiTagSuggestion | null;
    return stored?.id === id ? stored : null;
  } catch {
    return null;
  }
}
