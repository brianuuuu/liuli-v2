import type { SystemConfig } from "../types/api";
import { apiClient } from "./client";

export type SystemConfigCreate = {
  config_key: string;
  config_value: string;
  config_type?: string;
  module_name?: string | null;
  description?: string | null;
  enabled?: boolean;
};

export type SystemConfigUpdate = Partial<Omit<SystemConfigCreate, "config_key">>;

export async function listSystemConfigs(): Promise<SystemConfig[]> {
  const response = await apiClient.get<SystemConfig[]>("/api/system-config");
  return response.data;
}

export async function createSystemConfig(payload: SystemConfigCreate): Promise<SystemConfig> {
  const response = await apiClient.post<SystemConfig>("/api/system-config", payload);
  return response.data;
}

export async function updateSystemConfig(configKey: string, payload: SystemConfigUpdate): Promise<SystemConfig> {
  const response = await apiClient.put<SystemConfig>(`/api/system-config/${encodeURIComponent(configKey)}`, payload);
  return response.data;
}

export async function deleteSystemConfig(configKey: string): Promise<void> {
  await apiClient.delete(`/api/system-config/${encodeURIComponent(configKey)}`);
}
