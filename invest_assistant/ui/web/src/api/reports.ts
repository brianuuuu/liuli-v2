import type { Page, Report } from "../types/api";
import { apiClient } from "./client";

export type PageParams = {
  limit?: number;
  offset?: number;
  report_kind?: "market" | "track" | "stock";
};

export type ReportCreate = {
  title: string;
  report_type: string;
  source_module: string;
  target_type?: string | null;
  target_id?: number | null;
  summary?: string | null;
  file_format?: string;
  file_path: string;
  generated_by?: string;
  status?: string;
  publish_time?: string | null;
};

export type ReportUpdate = Partial<ReportCreate>;

export async function listReports(params: PageParams = {}): Promise<Page<Report>> {
  const response = await apiClient.get<Page<Report>>("/api/reports", { params });
  return response.data;
}

export async function createReport(payload: ReportCreate): Promise<Report> {
  const response = await apiClient.post<Report>("/api/reports", payload);
  return response.data;
}

export async function updateReport(reportId: number, payload: ReportUpdate): Promise<Report> {
  const response = await apiClient.put<Report>(`/api/reports/${reportId}`, payload);
  return response.data;
}

export async function deleteReport(reportId: number): Promise<{ success: boolean }> {
  const response = await apiClient.delete<{ success: boolean }>(`/api/reports/${reportId}`);
  return response.data;
}

export async function getReportContent(reportId: number): Promise<string> {
  const response = await apiClient.get<string>(`/api/reports/${reportId}/content`, { responseType: "text" });
  return response.data;
}
