import { apiClient } from "./client";

export async function getMarketOverview(): Promise<Record<string, number>> {
  const response = await apiClient.get<Record<string, number>>("/api/market-radar/overview");
  return response.data;
}

export async function listMarketTags(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/tags");
  return response.data;
}

export async function listTagCandidates(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/market-radar/tag-candidates");
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
