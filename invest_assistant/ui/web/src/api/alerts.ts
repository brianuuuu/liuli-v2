import type { Page } from "../types/api";
import { apiClient } from "./client";

export type PageParams = {
  limit?: number;
  offset?: number;
};

export type AlertEventStats = {
  total: number;
  unread: number;
  read: number;
  handled: number;
  unhandled: number;
};

export async function listAlertEvents(params: PageParams = {}): Promise<Page<Record<string, unknown>>> {
  const response = await apiClient.get<Page<Record<string, unknown>>>("/api/alerts/events", { params });
  return response.data;
}

export async function getAlertEventStats(): Promise<AlertEventStats> {
  const response = await apiClient.get<AlertEventStats>("/api/alerts/events/stats");
  return response.data;
}

export async function listAlertRules(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/alerts/rules");
  return response.data;
}

export async function markAllAlertsRead(): Promise<{ updated_count: number }> {
  const response = await apiClient.post<{ updated_count: number }>("/api/alerts/events/read-all");
  return response.data;
}

export async function markAlertRead(eventId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(`/api/alerts/events/${eventId}/read`);
  return response.data;
}

export async function deleteAlertEvent(eventId: number): Promise<{ deleted: boolean }> {
  const response = await apiClient.delete<{ deleted: boolean }>(`/api/alerts/events/${eventId}`);
  return response.data;
}

export async function enableAlertRule(ruleId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(`/api/alerts/rules/${ruleId}/enable`);
  return response.data;
}

export async function disableAlertRule(ruleId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(`/api/alerts/rules/${ruleId}/disable`);
  return response.data;
}

export async function deleteAlertRule(ruleId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.delete<Record<string, unknown>>(`/api/alerts/rules/${ruleId}`);
  return response.data;
}
