import { apiClient } from "./client";
import type { DataSourceStatus, Page } from "../types/api";

export type SystemStatus = {
  api: string;
  database: string;
};

export type DashboardTodoEvent = {
  id: number;
  event_level: string;
  title: string;
  message: string;
  status: string;
  event_time?: string | null;
};

export type DashboardSummary = {
  status: string;
  todo_events: DashboardTodoEvent[];
};

export type AiRequestLog = {
  id: number;
  request_id: string;
  provider: string;
  model: string;
  task_name: string;
  status: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
  error_message?: string | null;
  created_at?: string | null;
};

export type WorkbenchRunRequest = {
  id: number;
  job_name: string;
  status: string;
  requested_at: string;
  started_at?: string | null;
  finished_at?: string | null;
};

export type WorkbenchOperationJob = {
  job_name: string;
  exists: boolean;
  last_run_at?: string | null;
  last_status?: string | null;
};

export type WorkbenchToday = {
  source_stats: {
    total: number;
    news: number;
    announcement: number;
    sentiment: number;
    report: number;
  };
  active: {
    tags: number;
    hotwords: number;
    stocks: number;
    tracks: number;
  };
  new: {
    hotwords: number;
  };
  ai: {
    today: number;
    today_tokens: number;
  };
  todo: {
    pending_suggestions: number;
    pending_track_materials: number;
    pending_stock_materials: number;
    unread_alerts: number;
    failed_jobs: number;
    total: number;
  };
  operation_jobs: WorkbenchOperationJob[];
  recent_run_requests: WorkbenchRunRequest[];
};

export type AiLogStats = {
  total: number;
  today: number;
  today_tokens: number;
};

export type AiLogListParams = {
  limit?: number;
  offset?: number;
};

const aiLogsRequests = new Map<string, Promise<Page<AiRequestLog>>>();
let aiLogStatsRequest: Promise<AiLogStats> | null = null;
let workbenchTodayRequest: Promise<WorkbenchToday> | null = null;

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await apiClient.get<SystemStatus>("/api/console/system-status");
  return response.data;
}

export async function getDashboard(): Promise<DashboardSummary> {
  const response = await apiClient.get<DashboardSummary>("/api/console/dashboard");
  return response.data;
}

export async function getWorkbenchToday(): Promise<WorkbenchToday> {
  if (workbenchTodayRequest) return workbenchTodayRequest;
  workbenchTodayRequest = apiClient
    .get<WorkbenchToday>("/api/console/workbench-today")
    .then((response) => response.data)
    .finally(() => {
      workbenchTodayRequest = null;
    });
  return workbenchTodayRequest;
}

export async function getDataSources(): Promise<DataSourceStatus[]> {
  const response = await apiClient.get<DataSourceStatus[]>("/api/console/data-sources");
  return response.data;
}

export async function getAiLogStats(): Promise<AiLogStats> {
  if (aiLogStatsRequest) return aiLogStatsRequest;
  aiLogStatsRequest = apiClient
    .get<AiLogStats>("/api/console/ai-logs/stats")
    .then((response) => response.data)
    .finally(() => {
      aiLogStatsRequest = null;
    });
  return aiLogStatsRequest;
}

export async function getAiLogs(params: AiLogListParams = { limit: 50, offset: 0 }): Promise<Page<AiRequestLog>> {
  const requestParams = { limit: 50, offset: 0, ...params };
  const requestKey = JSON.stringify(requestParams);
  const existingRequest = aiLogsRequests.get(requestKey);
  if (existingRequest) return existingRequest;
  const request = apiClient
    .get<Page<AiRequestLog>>("/api/console/ai-logs", { params: requestParams })
    .then((response) => response.data)
    .finally(() => {
      aiLogsRequests.delete(requestKey);
    });
  aiLogsRequests.set(requestKey, request);
  return request;
}
