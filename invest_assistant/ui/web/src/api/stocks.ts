import type { Stock } from "../types/api";
import { apiClient } from "./client";

export async function listStocks(): Promise<Stock[]> {
  const response = await apiClient.get<Stock[]>("/api/stocks");
  return response.data;
}

export async function searchStocks(keyword: string): Promise<Stock[]> {
  const response = await apiClient.get<Stock[]>("/api/stocks/search", { params: { keyword } });
  return response.data;
}
