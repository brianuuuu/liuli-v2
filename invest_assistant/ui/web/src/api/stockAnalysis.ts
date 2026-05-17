import type { StockCompareGroup, StockPoolItem, StockResearchNote, StockScoreSnapshot, StockTrackTagBinding } from "../types/api";
import { apiClient } from "./client";

export type StockPoolPayload = {
  stock_id: number;
  status?: string;
};

export type StockNotePayload = {
  note_type: string;
  title: string;
  content: string;
  related_track_id?: number | null;
};

export type StockScorePayload = {
  score_date: string;
  track_id?: number | null;
  growth_score?: number;
  valuation_score?: number;
  moat_score?: number;
  risk_score?: number;
  total_score?: number;
};

export type CompareGroupPayload = {
  name: string;
  track_id?: number | null;
  stock_ids: string;
  description?: string | null;
};

export type StockTrackTagBindingPayload = {
  track_tag_id: number;
  relation_type?: string | null;
  conviction?: number;
  reason?: string | null;
  status?: string;
};

export async function listStockPool(): Promise<StockPoolItem[]> {
  const response = await apiClient.get<StockPoolItem[]>("/api/stock-analysis/pool");
  return response.data;
}

export async function createStockPoolItem(payload: StockPoolPayload): Promise<StockPoolItem> {
  const response = await apiClient.post<StockPoolItem>("/api/stock-analysis/pool", payload);
  return response.data;
}

export async function updateStockPoolItem(poolId: number, payload: StockPoolPayload): Promise<StockPoolItem> {
  const response = await apiClient.put<StockPoolItem>(`/api/stock-analysis/pool/${poolId}`, payload);
  return response.data;
}

export async function listStockNotes(stockId: number): Promise<StockResearchNote[]> {
  const response = await apiClient.get<StockResearchNote[]>(`/api/stock-analysis/stocks/${stockId}/notes`);
  return response.data;
}

export async function createStockNote(stockId: number, payload: StockNotePayload): Promise<StockResearchNote> {
  const response = await apiClient.post<StockResearchNote>(`/api/stock-analysis/stocks/${stockId}/notes`, payload);
  return response.data;
}

export async function listStockScores(stockId: number): Promise<StockScoreSnapshot[]> {
  const response = await apiClient.get<StockScoreSnapshot[]>(`/api/stock-analysis/stocks/${stockId}/scores`);
  return response.data;
}

export async function createStockScore(stockId: number, payload: StockScorePayload): Promise<StockScoreSnapshot> {
  const response = await apiClient.post<StockScoreSnapshot>(`/api/stock-analysis/stocks/${stockId}/scores`, payload);
  return response.data;
}

export async function listCompareGroups(): Promise<StockCompareGroup[]> {
  const response = await apiClient.get<StockCompareGroup[]>("/api/stock-analysis/compare-groups");
  return response.data;
}

export async function createCompareGroup(payload: CompareGroupPayload): Promise<StockCompareGroup> {
  const response = await apiClient.post<StockCompareGroup>("/api/stock-analysis/compare-groups", payload);
  return response.data;
}

export async function listStockReports(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/stock-analysis/reports");
  return response.data;
}

export async function listStockTrackTags(stockId: number): Promise<StockTrackTagBinding[]> {
  const response = await apiClient.get<StockTrackTagBinding[]>(`/api/stock-analysis/stocks/${stockId}/track-tags`);
  return response.data;
}

export async function bindStockTrackTag(stockId: number, payload: StockTrackTagBindingPayload): Promise<StockTrackTagBinding> {
  const response = await apiClient.post<StockTrackTagBinding>(`/api/stock-analysis/stocks/${stockId}/track-tags`, payload);
  return response.data;
}

export async function updateStockTrackTagBinding(bindingId: number, payload: Partial<StockTrackTagBindingPayload>): Promise<StockTrackTagBinding> {
  const response = await apiClient.put<StockTrackTagBinding>(`/api/stock-analysis/track-tag-bindings/${bindingId}`, payload);
  return response.data;
}

export async function disableStockTrackTagBinding(bindingId: number): Promise<StockTrackTagBinding> {
  const response = await apiClient.delete<StockTrackTagBinding>(`/api/stock-analysis/track-tag-bindings/${bindingId}`);
  return response.data;
}
