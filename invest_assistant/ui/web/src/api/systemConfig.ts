import { apiClient } from "./client";

export async function listSystemConfigs(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/system-config");
  return response.data;
}
