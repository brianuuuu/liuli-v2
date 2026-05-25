import type { Stock } from "../types/api";
import { apiClient } from "./client";

export type StockImportItem = {
  symbol?: string | null;
  stock_code: string;
  stock_name: string;
  name_pinyin?: string | null;
  name_abbr?: string | null;
  market?: string | null;
  exchange?: string | null;
};

export type StockUpdate = Partial<StockImportItem & { status: string }>;

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
