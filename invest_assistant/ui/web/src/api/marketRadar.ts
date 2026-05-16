import { apiClient } from "./client";

export async function getMarketOverview(): Promise<Record<string, number>> {
  const response = await apiClient.get<Record<string, number>>("/api/market-radar/overview");
  return response.data;
}

export async function listMarketTags(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/tags");
  return response.data;
}

export async function createMarketTag(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>("/api/market-radar/tags", payload);
  return response.data;
}

export async function updateMarketTag(tagId: number, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await apiClient.put<Record<string, unknown>>(`/api/market-radar/tags/${tagId}`, payload);
  return response.data;
}

export async function disableMarketTag(tagId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.delete<Record<string, unknown>>(`/api/market-radar/tags/${tagId}`);
  return response.data;
}

export async function listTagCandidates(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/tag-candidates");
  return response.data;
}

export async function approveTagCandidate(candidateId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(`/api/market-radar/tag-candidates/${candidateId}/approve`);
  return response.data;
}

export async function rejectTagCandidate(candidateId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(`/api/market-radar/tag-candidates/${candidateId}/reject`);
  return response.data;
}

export async function mergeTagCandidate(candidateId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(`/api/market-radar/tag-candidates/${candidateId}/merge`);
  return response.data;
}

export async function listSourceItems(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/source-items");
  return response.data;
}

export async function listRankings(type: string, window = "24h"): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/rankings", {
    params: { type, window }
  });
  return response.data;
}

export async function getStockTrackGraph(window = "24h"): Promise<Record<string, unknown>> {
  const response = await apiClient.get<Record<string, unknown>>("/api/market-radar/graphs/stock-track", {
    params: { window }
  });
  return response.data;
}
