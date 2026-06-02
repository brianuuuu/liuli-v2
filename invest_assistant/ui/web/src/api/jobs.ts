import type { JobConfig, JobRunLog, JobRunRequest } from "../types/api";
import { apiClient } from "./client";

export const STOCK_EVENT_REVIEW_JOB_NAME = "stock_analysis.review_stock_events_deepseek";

export type JobConfigUpdate = Partial<Pick<JobConfig, "config_json" | "ext_json">>;

export async function listJobs(): Promise<JobConfig[]> {
  const response = await apiClient.get<JobConfig[]>("/api/jobs");
  return response.data;
}

export async function syncJobDefinitions(): Promise<{ synced: number }> {
  const response = await apiClient.post<{ synced: number }>("/api/jobs/sync-definitions");
  return response.data;
}

export async function updateJob(jobName: string, payload: JobConfigUpdate): Promise<JobConfig> {
  const response = await apiClient.put<JobConfig>(`/api/jobs/${encodeURIComponent(jobName)}`, payload);
  return response.data;
}

export async function runJob(jobName: string, params: Record<string, unknown> = {}): Promise<JobRunRequest> {
  const response = await apiClient.post<JobRunRequest>(`/api/jobs/${encodeURIComponent(jobName)}/run`, { params });
  return response.data;
}

export async function listRunRequests(): Promise<JobRunRequest[]> {
  const response = await apiClient.get<JobRunRequest[]>("/api/jobs/run-requests");
  return response.data;
}

export async function listJobLogs(jobName: string): Promise<JobRunLog[]> {
  const response = await apiClient.get<JobRunLog[]>(`/api/jobs/${encodeURIComponent(jobName)}/logs`);
  return response.data;
}
