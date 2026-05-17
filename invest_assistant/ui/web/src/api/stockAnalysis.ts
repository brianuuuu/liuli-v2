import type { StockCompareGroup, StockPoolItem, StockResearchNote, StockScoreSnapshot } from "../types/api";
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
