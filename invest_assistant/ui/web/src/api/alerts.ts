import { apiClient } from "./client";

export async function listAlertEvents(): Promise<Record<string, unknown>[]> {
  const response = await apiClient.get<Record<string, unknown>[]>("/api/alerts/events");
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
