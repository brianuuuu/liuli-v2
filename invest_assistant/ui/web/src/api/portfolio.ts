import { apiClient } from "./client";
import type {
  AdjustAdviceCandidate,
  AdjustAdviceReviews,
  Portfolio,
  PortfolioCashBalance,
  PortfolioCashFlow,
  PortfolioDashboard,
  PortfolioGroup,
  PortfolioOverview,
  PortfolioPosition,
  PortfolioPositionChange,
  PortfolioReviewPerformance,
  PortfolioValueSnapshot,
  PositionChangeReasonType,
  PositionChangeReview
} from "../types/api";

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
  /** 调仓留痕：只写进调仓记录，不落到持仓行上 */
  change_date?: string | null;
  change_note?: string | null;
  /** 留空时后端按调仓日收盘价估算 */
  change_price?: number | null;
  change_reason_type?: PositionChangeReasonType | null;
  change_advice_item_id?: number | null;
};

export type PortfolioCashPayload = {
  amount: number;
  currency?: string;
  note?: string | null;
};

export type PortfolioCashFlowPayload = {
  flow_type: string;
  amount: number;
  currency?: string;
  flow_date?: string | null;
  note?: string | null;
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

/** portfolioId 为空表示所有组合 */
export async function getPortfolioDashboard(portfolioId: number | null): Promise<PortfolioDashboard> {
  const response = await apiClient.get<PortfolioDashboard>(portfolioId ? `/api/portfolios/${portfolioId}/dashboard` : "/api/portfolios/dashboard");
  return response.data;
}

export async function getPortfolioOverview(portfolioId?: number | null): Promise<PortfolioOverview> {
  const response = await apiClient.get<PortfolioOverview>("/api/portfolios/overview", {
    params: portfolioId ? { portfolio_id: portfolioId } : undefined
  });
  return response.data;
}

export async function listPortfolioValueSnapshots(portfolioId?: number | null, days = 180): Promise<PortfolioValueSnapshot[]> {
  const response = await apiClient.get<PortfolioValueSnapshot[]>("/api/portfolios/value-snapshots", {
    params: { ...(portfolioId ? { portfolio_id: portfolioId } : {}), days }
  });
  return response.data;
}

export async function getPortfolioReviewPerformance(
  portfolioId?: number | null,
  period = "year",
  refreshBenchmark = true
): Promise<PortfolioReviewPerformance> {
  const response = await apiClient.get<PortfolioReviewPerformance>("/api/portfolios/review-performance", {
    params: {
      period,
      refresh_benchmark: refreshBenchmark,
      ...(portfolioId ? { portfolio_id: portfolioId } : {})
    }
  });
  return response.data;
}

export async function getAdjustAdviceReviews(portfolioId?: number | null, limit = 30): Promise<AdjustAdviceReviews> {
  const response = await apiClient.get<AdjustAdviceReviews>("/api/portfolios/adjust-advice", {
    params: { limit, ...(portfolioId ? { portfolio_id: portfolioId } : {}) }
  });
  return response.data;
}

export async function listAdjustAdviceCandidates(stockId: number, changeDate?: string | null, portfolioId?: number | null): Promise<AdjustAdviceCandidate[]> {
  const response = await apiClient.get<AdjustAdviceCandidate[]>("/api/portfolios/adjust-advice/candidates", {
    params: { stock_id: stockId, ...(changeDate ? { change_date: changeDate } : {}), ...(portfolioId ? { portfolio_id: portfolioId } : {}) }
  });
  return response.data;
}

export async function getPositionChangeReview(portfolioId?: number | null): Promise<PositionChangeReview> {
  const response = await apiClient.get<PositionChangeReview>("/api/portfolios/position-change-review", {
    params: portfolioId ? { portfolio_id: portfolioId } : undefined
  });
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

export async function getPortfolioCash(portfolioId: number): Promise<PortfolioCashBalance> {
  const response = await apiClient.get<PortfolioCashBalance>(`/api/portfolios/${portfolioId}/cash`);
  return response.data;
}

export async function updatePortfolioCash(portfolioId: number, payload: PortfolioCashPayload): Promise<PortfolioCashBalance> {
  const response = await apiClient.put<PortfolioCashBalance>(`/api/portfolios/${portfolioId}/cash`, payload);
  return response.data;
}

export async function listPortfolioPositionChanges(portfolioId: number | null, limit = 200): Promise<PortfolioPositionChange[]> {
  const url = portfolioId ? `/api/portfolios/${portfolioId}/position-changes` : "/api/portfolios/position-changes";
  const response = await apiClient.get<PortfolioPositionChange[]>(url, {
    params: { limit }
  });
  return response.data;
}

export async function listPortfolioCashFlows(portfolioId: number | null): Promise<PortfolioCashFlow[]> {
  const response = await apiClient.get<PortfolioCashFlow[]>(portfolioId ? `/api/portfolios/${portfolioId}/cash-flows` : "/api/portfolios/cash-flows");
  return response.data;
}

export async function createPortfolioCashFlow(portfolioId: number, payload: PortfolioCashFlowPayload): Promise<PortfolioCashFlow> {
  const response = await apiClient.post<PortfolioCashFlow>(`/api/portfolios/${portfolioId}/cash-flows`, payload);
  return response.data;
}

export async function refreshPortfolioQuotes(portfolioId: number): Promise<{ updated_count: number; warnings: { stock_code: string; message: string }[]; dashboard: PortfolioDashboard }> {
  const response = await apiClient.post<{ updated_count: number; warnings: { stock_code: string; message: string }[]; dashboard: PortfolioDashboard }>(`/api/portfolios/${portfolioId}/positions/refresh-quotes`);
  return response.data;
}

export async function refreshAllPortfolioQuotes(): Promise<{ updated_count: number; warnings: { stock_code?: string; message: string }[] }> {
  const response = await apiClient.post<{ updated_count: number; warnings: { stock_code?: string; message: string }[] }>("/api/portfolios/refresh-quotes");
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
