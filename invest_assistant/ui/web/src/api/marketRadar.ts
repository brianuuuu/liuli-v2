import type { AiTagSuggestion, Hotword, JobRunRequest, MarketGraph, MarketTag, Page, SourceItem, TagBinding, TagHeat } from "../types/api";
import { apiClient } from "./client";

export type MarketOverview = {
  source_items: number;
  tags: number;
  active_tags: number;
  ai_tag_suggestions: number;
};

export type SourceItemDailyStats = {
  total: number;
  news: number;
  announcement: number;
  sentiment: number;
  report: number;
};

export type HotwordStats = {
  total: number;
  active: number;
  today: number;
};

export type MarketTagPayload = {
  name: string;
  type?: string | null;
  source?: string | null;
  status?: string;
};

export type SourceItemPayload = {
  source_type: string;
  source_name: string;
  title: string;
  content: string;
  source_url?: string | null;
  publish_time?: string | null;
  related_type?: string | null;
  related_id?: number | null;
};

export type MarketFlashSyncResult = {
  success: boolean;
  message: string;
  fetched_count: number;
  inserted_count: number;
  skipped_count: number;
};

export type AiTagSuggestionPayload = {
  suggested_text: string;
  final_tag_name?: string | null;
  score?: number | null;
  reason?: string | null;
  status?: string;
  ext_json?: string;
};

export type AiTagSuggestionApprovePayload = {
  final_tag_name?: string | null;
  target_type: "stock" | "track" | "hotword";
  target_id?: number | null;
  target_name?: string | null;
};

export type HotwordPayload = {
  name: string;
  description?: string | null;
  status?: string;
};

export type TagBindingPayload = {
  name: string;
  source?: string | null;
  status?: string;
};

export type RankingType = "all" | "stock" | "track" | "hotword";
export type RankingWindow = "1h" | "24h" | "7d" | "30d" | "90d";
export type GraphType = "track" | "hotword" | "track_hotword";

export type PageParams = {
  limit?: number;
  offset?: number;
  q?: string;
};

export async function getMarketOverview(): Promise<MarketOverview> {
  const response = await apiClient.get<MarketOverview>("/api/market-radar/overview");
  return response.data;
}

export async function listMarketTags(type?: string): Promise<MarketTag[]> {
  const response = await apiClient.get<MarketTag[]>("/api/market-radar/tags", { params: type ? { type } : undefined });
  return response.data;
}

export async function createMarketTag(payload: MarketTagPayload): Promise<MarketTag> {
  const response = await apiClient.post<MarketTag>("/api/market-radar/tags", payload);
  return response.data;
}

export async function createHotword(payload: HotwordPayload): Promise<Hotword> {
  const response = await apiClient.post<Hotword>("/api/market-radar/hotwords", payload);
  return response.data;
}

export async function listHotwords(status?: string, params: PageParams = {}): Promise<Page<Hotword>> {
  const response = await apiClient.get<Page<Hotword>>("/api/market-radar/hotwords", {
    params: { ...params, ...(status ? { status } : {}) }
  });
  return response.data;
}

export async function getHotwordStats(targetDate?: string): Promise<HotwordStats> {
  const response = await apiClient.get<HotwordStats>("/api/market-radar/hotwords/stats", {
    params: targetDate ? { target_date: targetDate } : undefined
  });
  return response.data;
}

export async function bindHotwordTag(hotwordId: number, payload: TagBindingPayload): Promise<TagBinding> {
  const response = await apiClient.post<TagBinding>(`/api/market-radar/hotwords/${hotwordId}/tags`, payload);
  return response.data;
}

export async function updateMarketTag(tagId: number, payload: Partial<MarketTagPayload>): Promise<MarketTag> {
  const response = await apiClient.put<MarketTag>(`/api/market-radar/tags/${tagId}`, payload);
  return response.data;
}

export async function disableMarketTag(tagId: number): Promise<MarketTag> {
  const response = await apiClient.delete<MarketTag>(`/api/market-radar/tags/${tagId}`);
  return response.data;
}

export async function getTagTrend(tagId: number): Promise<TagHeat[]> {
  const response = await apiClient.get<TagHeat[]>(`/api/market-radar/tags/${tagId}/trend`);
  return response.data;
}

export async function listAiTagSuggestions(status?: string, params: PageParams = {}): Promise<Page<AiTagSuggestion>> {
  const response = await apiClient.get<Page<AiTagSuggestion>>("/api/market-radar/ai-tag-suggestions", {
    params: { ...params, ...(status ? { status } : {}) }
  });
  return response.data;
}

export async function createAiTagSuggestion(payload: AiTagSuggestionPayload): Promise<AiTagSuggestion> {
  const response = await apiClient.post<AiTagSuggestion>("/api/market-radar/ai-tag-suggestions", payload);
  return response.data;
}

export async function approveAiTagSuggestion(suggestionId: number, payload: AiTagSuggestionApprovePayload): Promise<AiTagSuggestion> {
  const response = await apiClient.post<AiTagSuggestion>(`/api/market-radar/ai-tag-suggestions/${suggestionId}/approve`, payload);
  return response.data;
}

export async function rejectAiTagSuggestion(suggestionId: number): Promise<AiTagSuggestion> {
  const response = await apiClient.post<AiTagSuggestion>(`/api/market-radar/ai-tag-suggestions/${suggestionId}/reject`);
  return response.data;
}

export async function restoreAiTagSuggestion(suggestionId: number): Promise<AiTagSuggestion> {
  const response = await apiClient.post<AiTagSuggestion>(`/api/market-radar/ai-tag-suggestions/${suggestionId}/restore`);
  return response.data;
}

export type SourceItemListParams = {
  limit?: number;
  offset?: number;
  q?: string;
  source_name?: string;
  source_type?: string;
  important_only?: boolean;
  tag_id?: number;
};

export async function listSourceItems(params: SourceItemListParams = {}): Promise<Page<SourceItem>> {
  const response = await apiClient.get<Page<SourceItem>>("/api/market-radar/source-items", { params });
  return response.data;
}

export async function getSourceItemDailyStats(targetDate?: string): Promise<SourceItemDailyStats> {
  const response = await apiClient.get<SourceItemDailyStats>("/api/market-radar/source-items/daily-stats", {
    params: targetDate ? { target_date: targetDate } : undefined
  });
  return response.data;
}

export async function createSourceItem(payload: SourceItemPayload): Promise<SourceItem> {
  const response = await apiClient.post<SourceItem>("/api/market-radar/source-items", payload);
  return response.data;
}

export async function syncClsMarketFlashes(limit = 100): Promise<MarketFlashSyncResult> {
  const response = await apiClient.post<MarketFlashSyncResult>("/api/market-radar/source-items/sync-cls", { limit });
  return response.data;
}

export async function syncFutuMarketFlashes(limit = 100): Promise<JobRunRequest> {
  const response = await apiClient.post<JobRunRequest>("/api/jobs/market_radar.fetch_futu_news/run", { params: { limit } });
  return response.data;
}

export async function listRankings(type: RankingType, window: RankingWindow = "24h"): Promise<TagHeat[]> {
  const response = await apiClient.get<TagHeat[]>("/api/market-radar/rankings", {
    params: { type, window }
  });
  return response.data;
}

export async function getStockTrackGraph(window: RankingWindow = "24h"): Promise<MarketGraph> {
  const response = await apiClient.get<MarketGraph>("/api/market-radar/graphs/stock-track", {
    params: { window }
  });
  return response.data;
}

export async function getStockHotwordGraph(window: RankingWindow = "24h"): Promise<MarketGraph> {
  const response = await apiClient.get<MarketGraph>("/api/market-radar/graphs/stock-hotword", {
    params: { window }
  });
  return response.data;
}

export async function getTrackHotwordGraph(window: RankingWindow = "24h"): Promise<MarketGraph> {
  const response = await apiClient.get<MarketGraph>("/api/market-radar/graphs/track-hotword", {
    params: { window }
  });
  return response.data;
}
