import type { Stock, StockAlias } from "../types/api";
import { apiClient } from "./client";

export type StockImportItem = {
  stock_code: string;
  stock_name: string;
  market?: string | null;
  exchange?: string | null;
};

export type StockUpdate = Partial<StockImportItem & { status: string }>;

export type StockAliasCreate = {
  alias: string;
  alias_type?: string | null;
  source?: string | null;
};

export async function listStocks(params: { limit?: number; offset?: number } = {}): Promise<Stock[]> {
  const response = await apiClient.get<Stock[]>("/api/stocks", { params });
  return response.data;
}

export async function searchStocks(keyword: string): Promise<Stock[]> {
  const response = await apiClient.get<Stock[]>("/api/stocks/search", { params: { keyword } });
  return response.data;
}

export async function importStocks(items: StockImportItem[]): Promise<Stock[]> {
  const response = await apiClient.post<Stock[]>("/api/stocks/import", items);
  return response.data;
}

export async function updateStock(stockId: number, payload: StockUpdate): Promise<Stock> {
  const response = await apiClient.put<Stock>(`/api/stocks/${stockId}`, payload);
  return response.data;
}

export async function listStockAliases(stockId: number): Promise<StockAlias[]> {
  const response = await apiClient.get<StockAlias[]>(`/api/stocks/${stockId}/aliases`);
  return response.data;
}

export async function createStockAlias(stockId: number, payload: StockAliasCreate): Promise<StockAlias> {
  const response = await apiClient.post<StockAlias>(`/api/stocks/${stockId}/aliases`, payload);
  return response.data;
}
