import { apiClient } from "./client";

export async function listStockPool(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/stock-analysis/pool");
  return response.data;
}

export async function listCompareGroups(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/stock-analysis/compare-groups");
  return response.data;
}

export async function listStockReports(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/stock-analysis/reports");
  return response.data;
}
