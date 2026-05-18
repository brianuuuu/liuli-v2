import { apiClient } from "./client";
import type { PortfolioGroup } from "../types/api";

export async function listPortfolios(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/portfolios");
  return response.data;
}

export async function listPortfolioPositions(portfolioId: number): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>(`/api/portfolios/${portfolioId}/positions`);
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
