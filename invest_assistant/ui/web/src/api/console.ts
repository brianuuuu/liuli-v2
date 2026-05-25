import { apiClient } from "./client";
import type { DataSourceStatus } from "../types/api";

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

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await apiClient.get<SystemStatus>("/api/console/system-status");
  return response.data;
}

export async function getDashboard(): Promise<DashboardSummary> {
  const response = await apiClient.get<DashboardSummary>("/api/console/dashboard");
  return response.data;
}

export async function getDataSources(): Promise<DataSourceStatus[]> {
  const response = await apiClient.get<DataSourceStatus[]>("/api/console/data-sources");
  return response.data;
}

export async function getAiLogs(): Promise<AiRequestLog[]> {
  const response = await apiClient.get<AiRequestLog[]>("/api/console/ai-logs");
  return response.data;
}
