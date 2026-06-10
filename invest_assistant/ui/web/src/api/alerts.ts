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

export async function markAlertHandled(eventId: number): Promise<Record<string, unknown>> {
  const response = await apiClient.post<Record<string, unknown>>(`/api/alerts/events/${eventId}/handle`);
  return response.data;
}
