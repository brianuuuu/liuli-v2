import type { StockCompareGroup, StockDashboard, StockPoolItem, StockResearchNote, StockScoreComparisonItem, StockScoreSnapshot, StockTrackRelation, StockValuationComparisonItem, TagBinding, StockMaterial, StockMaterialPayload } from "../types/api";
import { apiClient } from "./client";

export type StockPoolPayload = {
  stock_id: number;
  status?: string;
  source?: string;
  reason?: string | null;
  track_ids?: number[];
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

export type StockTrackRelationPayload = {
  track_id: number;
  relation_type?: string | null;
  conviction?: number;
  reason?: string | null;
  status?: string;
};

export type TagBindingPayload = {
  name: string;
  source?: string | null;
  status?: string;
};

export async function getStockDashboard(stockId?: number | null): Promise<StockDashboard> {
  const response = await apiClient.get<StockDashboard>("/api/stock-analysis/dashboard", {
    params: stockId ? { stock_id: stockId } : undefined,
  });
  return response.data;
}

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

export async function listStockCandidates(): Promise<StockPoolItem[]> {
  const response = await apiClient.get<StockPoolItem[]>("/api/stock-analysis/candidates");
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

export async function listStockScoreComparison(): Promise<StockScoreComparisonItem[]> {
  const response = await apiClient.get<StockScoreComparisonItem[]>("/api/stock-analysis/score-comparison");
  return response.data;
}

export async function listStockValuationComparison(): Promise<StockValuationComparisonItem[]> {
  const response = await apiClient.get<StockValuationComparisonItem[]>("/api/stock-analysis/valuation-comparison");
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

export async function listStockTrackRelations(stockId: number): Promise<StockTrackRelation[]> {
  const response = await apiClient.get<StockTrackRelation[]>(`/api/stock-analysis/stocks/${stockId}/tracks`);
  return response.data;
}

export async function listStockTagBindings(stockId: number): Promise<TagBinding[]> {
  const response = await apiClient.get<TagBinding[]>(`/api/stock-analysis/stocks/${stockId}/tags`);
  return response.data;
}

export async function bindStockTag(stockId: number, payload: TagBindingPayload): Promise<TagBinding> {
  const response = await apiClient.post<TagBinding>(`/api/stock-analysis/stocks/${stockId}/tags`, payload);
  return response.data;
}

export async function bindStockTrackRelation(stockId: number, payload: StockTrackRelationPayload): Promise<StockTrackRelation> {
  const response = await apiClient.post<StockTrackRelation>(`/api/stock-analysis/stocks/${stockId}/tracks`, payload);
  return response.data;
}

export async function updateStockTrackRelation(relationId: number, payload: Partial<StockTrackRelationPayload>): Promise<StockTrackRelation> {
  const response = await apiClient.put<StockTrackRelation>(`/api/stock-analysis/track-relations/${relationId}`, payload);
  return response.data;
}

export async function disableStockTrackRelation(relationId: number): Promise<StockTrackRelation> {
  const response = await apiClient.delete<StockTrackRelation>(`/api/stock-analysis/track-relations/${relationId}`);
  return response.data;
}

export async function listAllStockMaterials(): Promise<StockMaterial[]> {
  const response = await apiClient.get<StockMaterial[]>("/api/stock-analysis/materials");
  return response.data;
}

export async function listStockMaterials(stockId: number): Promise<StockMaterial[]> {
  const response = await apiClient.get<StockMaterial[]>(`/api/stock-analysis/stocks/${stockId}/materials`);
  return response.data;
}

export async function createStockMaterial(stockId: number, payload: StockMaterialPayload): Promise<StockMaterial> {
  const response = await apiClient.post<StockMaterial>(`/api/stock-analysis/stocks/${stockId}/materials`, payload);
  return response.data;
}

export async function updateStockMaterial(materialId: number, payload: Partial<StockMaterialPayload>): Promise<StockMaterial> {
  const response = await apiClient.put<StockMaterial>(`/api/stock-analysis/materials/${materialId}`, payload);
  return response.data;
}
