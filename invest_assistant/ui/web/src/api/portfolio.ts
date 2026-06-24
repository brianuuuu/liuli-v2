import { apiClient } from "./client";
import type { Portfolio, PortfolioDashboard, PortfolioGroup, PortfolioPosition } from "../types/api";

export type PortfolioPayload = {
  name: string;
  base_currency?: string;
};

export type PortfolioPositionPayload = {
  stock_id: number;
  quantity: number;
  group_id?: number | null;
  note?: string | null;
  status?: string;
};

export async function listPortfolios(): Promise<Portfolio[]> {
  const response = await apiClient.get<Portfolio[]>("/api/portfolios");
  return response.data;
}

export async function createPortfolio(payload: PortfolioPayload): Promise<Portfolio> {
  const response = await apiClient.post<Portfolio>("/api/portfolios", payload);
  return response.data;
}

export async function updatePortfolio(portfolioId: number, payload: PortfolioPayload): Promise<Portfolio> {
  const response = await apiClient.put<Portfolio>(`/api/portfolios/${portfolioId}`, payload);
  return response.data;
}

export async function deletePortfolio(portfolioId: number): Promise<{ success: boolean }> {
  const response = await apiClient.delete<{ success: boolean }>(`/api/portfolios/${portfolioId}`);
  return response.data;
}

export async function getPortfolioDashboard(portfolioId: number): Promise<PortfolioDashboard> {
  const response = await apiClient.get<PortfolioDashboard>(`/api/portfolios/${portfolioId}/dashboard`);
  return response.data;
}

export async function listPortfolioPositions(portfolioId: number): Promise<PortfolioPosition[]> {
  const response = await apiClient.get<PortfolioPosition[]>(`/api/portfolios/${portfolioId}/positions`);
  return response.data;
}

export async function createOrUpdatePosition(portfolioId: number, payload: PortfolioPositionPayload): Promise<PortfolioPosition> {
  const response = await apiClient.post<PortfolioPosition>(`/api/portfolios/${portfolioId}/positions`, payload);
  return response.data;
}

export async function updatePosition(portfolioId: number, positionId: number, payload: PortfolioPositionPayload): Promise<PortfolioPosition> {
  const response = await apiClient.put<PortfolioPosition>(`/api/portfolios/${portfolioId}/positions/${positionId}`, payload);
  return response.data;
}

export async function deletePosition(portfolioId: number, positionId: number): Promise<{ success: boolean }> {
  const response = await apiClient.delete<{ success: boolean }>(`/api/portfolios/${portfolioId}/positions/${positionId}`);
  return response.data;
}

export async function refreshPortfolioQuotes(portfolioId: number): Promise<{ updated_count: number; warnings: { stock_code: string; message: string }[]; dashboard: PortfolioDashboard }> {
  const response = await apiClient.post<{ updated_count: number; warnings: { stock_code: string; message: string }[]; dashboard: PortfolioDashboard }>(`/api/portfolios/${portfolioId}/positions/refresh-quotes`);
  return response.data;
}

export async function listPortfolioGroups(portfolioId: number): Promise<PortfolioGroup[]> {
  const response = await apiClient.get<PortfolioGroup[]>(`/api/portfolios/${portfolioId}/groups`);
  return response.data;
}

export async function listPortfolioReviews(portfolioId: number): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>(`/api/portfolios/${portfolioId}/review`);
  return response.data;
}
