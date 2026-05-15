import { apiClient } from "./client";

export async function listPortfolios(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/portfolios");
  return response.data;
}

export async function listPortfolioPositions(portfolioId: number): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>(`/api/portfolios/${portfolioId}/positions`);
  return response.data;
}

export async function listPortfolioReviews(portfolioId: number): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>(`/api/portfolios/${portfolioId}/review`);
  return response.data;
}
