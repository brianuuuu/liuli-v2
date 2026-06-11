import type { JobConfig, JobRunLog, JobRunRequest, Page } from "../types/api";
import { apiClient } from "./client";

export const STOCK_EVENT_REVIEW_JOB_NAME = "stock_analysis.review_stock_events_deepseek";
export const TRACK_EVENT_REVIEW_JOB_NAME = "track_discovery.review_track_events_deepseek";

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

export type PageParams = {
  limit?: number;
  offset?: number;
};

const runRequestsInFlight = new Map<string, Promise<Page<JobRunRequest>>>();

export async function listRunRequests(params: PageParams = {}): Promise<Page<JobRunRequest>> {
  const requestParams = { limit: 8, offset: 0, ...params };
  const key = JSON.stringify(requestParams);
  if (runRequestsInFlight.has(key)) {
    return runRequestsInFlight.get(key)!;
  }
  const request = apiClient
    .get<Page<JobRunRequest>>("/api/jobs/run-requests", { params: requestParams })
    .then((response) => response.data)
    .finally(() => {
      runRequestsInFlight.delete(key);
    });
  runRequestsInFlight.set(key, request);
  return request;
}

export async function listJobLogs(jobName: string, params: PageParams = {}): Promise<Page<JobRunLog>> {
  const response = await apiClient.get<Page<JobRunLog>>(`/api/jobs/${encodeURIComponent(jobName)}/logs`, { params });
  return response.data;
}
