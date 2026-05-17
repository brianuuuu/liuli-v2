import type { MarketGraph, MarketTag, SourceItem, TagCandidate, TagHeat } from "../types/api";
import { apiClient } from "./client";

export type MarketOverview = {
  source_items: number;
  tags: number;
  tag_candidates: number;
};

export type MarketTagPayload = {
  name: string;
  type: string;
  category?: string | null;
  stock_id?: number | null;
  status?: string;
};

export type SourceItemPayload = {
  source_type: string;
  source_name: string;
  title: string;
  content: string;
  source_url?: string | null;
  publish_time?: string | null;
};

export type MarketFlashSyncResult = {
  success: boolean;
  message: string;
  fetched_count: number;
  inserted_count: number;
  skipped_count: number;
};

export type TagCandidatePayload = {
  name: string;
  suggested_type: string;
  category?: string | null;
  source_item_id?: number | null;
  confidence?: number;
  reason?: string | null;
  status?: string;
};

export type RankingType = "stock" | "track" | "hotword";
export type RankingWindow = "1h" | "24h" | "7d" | "30d";
export type GraphType = "track" | "hotword";

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

export async function listTagCandidates(): Promise<TagCandidate[]> {
  const response = await apiClient.get<TagCandidate[]>("/api/market-radar/tag-candidates");
  return response.data;
}

export async function createTagCandidate(payload: TagCandidatePayload): Promise<TagCandidate> {
  const response = await apiClient.post<TagCandidate>("/api/market-radar/tag-candidates", payload);
  return response.data;
}

export async function approveTagCandidate(candidateId: number): Promise<TagCandidate> {
  const response = await apiClient.post<TagCandidate>(`/api/market-radar/tag-candidates/${candidateId}/approve`);
  return response.data;
}

export async function rejectTagCandidate(candidateId: number): Promise<TagCandidate> {
  const response = await apiClient.post<TagCandidate>(`/api/market-radar/tag-candidates/${candidateId}/reject`);
  return response.data;
}

export async function mergeTagCandidate(candidateId: number): Promise<TagCandidate> {
  const response = await apiClient.post<TagCandidate>(`/api/market-radar/tag-candidates/${candidateId}/merge`);
  return response.data;
}

export async function listSourceItems(): Promise<SourceItem[]> {
  const response = await apiClient.get<SourceItem[]>("/api/market-radar/source-items");
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
