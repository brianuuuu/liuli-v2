import type { JobConfig } from "../types/api";
import { apiClient } from "./client";

export async function listJobs(): Promise<JobConfig[]> {
  const response = await apiClient.get<JobConfig[]>("/api/jobs");
  return response.data;
}

export async function syncJobDefinitions(): Promise<{ synced: number }> {
  const response = await apiClient.post<{ synced: number }>("/api/jobs/sync-definitions");
  return response.data;
}

export async function runJob(jobName: string): Promise<unknown> {
  const response = await apiClient.post(`/api/jobs/${encodeURIComponent(jobName)}/run`, {});
  return response.data;
}

export async function listJobLogs(jobName: string): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>(`/api/jobs/${encodeURIComponent(jobName)}/logs`);
  return response.data;
}
