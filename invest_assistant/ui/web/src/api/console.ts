import { apiClient } from "./client";

export type SystemStatus = {
  api: string;
  database: string;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await apiClient.get<SystemStatus>("/api/console/system-status");
  return response.data;
}

export async function getDashboard(): Promise<Record<string, string>> {
  const response = await apiClient.get<Record<string, string>>("/api/console/dashboard");
  return response.data;
}

export async function getDataSources(): Promise<Record<string, string>[]> {
  const response = await apiClient.get<Record<string, string>[]>("/api/console/data-sources");
  return response.data;
}

export async function getAiLogs(): Promise<Record<string, string>[]> {
  const response = await apiClient.get<Record<string, string>[]>("/api/console/ai-logs");
  return response.data;
}
