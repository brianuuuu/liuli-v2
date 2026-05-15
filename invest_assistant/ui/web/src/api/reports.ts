import type { Report } from "../types/api";
import { apiClient } from "./client";

export async function listReports(): Promise<Report[]> {
  const response = await apiClient.get<Report[]>("/api/reports");
  return response.data;
}

export async function getReportContent(reportId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.get<Record<string, unknown>>(`/api/reports/${reportId}/content`);
  return response.data;
}
